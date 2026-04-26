import type { Config, Context } from '@netlify/functions';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { getServiceClient } from '../../src/lib/db/client';
import { QueueService } from '../../src/lib/queues/service';
import { notifyError } from '../../src/lib/utils/google-chat-notify';

/** Run every minute on Netlify */
export const config: Config = {
  schedule: '* * * * *',
};

/** Pending jobs older than this are treated as stuck and flagged loudly. */
const STUCK_JOB_THRESHOLD_SECONDS = parseInt(process.env.QUEUE_STUCK_THRESHOLD_SECONDS ?? '120', 10);

interface QueueRunStats {
  queue: string;
  claimed: number;
  dispatched: number;
  dispatchFailures: number;
  claimErrors: number;
  error?: string;
}

/**
 * Scheduled function: Process pending jobs from the queue.
 * Runs every minute on Netlify, or can be triggered manually via POST.
 *
 * Dispatch model:
 *   - Handlers are Netlify *background* functions (filename suffix `-background.ts`).
 *   - They MUST be invoked at `/.netlify/functions/<name>` so Netlify returns 202
 *     immediately and runs the handler in the background (up to 15 min).
 *   - Invoking them via `/api/<name>` (the Astro catch-all) executes the handler
 *     *inline* inside this scheduled function's 10s budget, which starves later
 *     queues (booking, crm) and slow AI replies. Don't do that.
 *   - Queues are processed in parallel so a slow queue can't block the others.
 *
 * Loud failure surface (see "louder failure" notes):
 *   - Stuck-job detector runs first and logs + emits conversation_events for any
 *     pending job whose run_at is older than STUCK_JOB_THRESHOLD_SECONDS.
 *   - Every tick logs a per-queue summary (claimed / dispatched / failures).
 *   - Response body is JSON with the summary, and status is 500 if ANY queue had
 *     claim errors OR stuck jobs were found — so it shows red in Netlify logs.
 */
export default async (_req: Request, _context: Context) => {
  const internalBaseUrl = new URL(_req.url).origin;
  const db = getServiceClient();
  const queueService = new QueueService(db);
  const workerId = `queue-runner:${randomUUID()}`;
  const leaseSeconds = parseInt(process.env.QUEUE_LEASE_SECONDS ?? '90', 10);
  const batchSize = parseInt(process.env.QUEUE_BATCH_SIZE ?? '25', 10);

  const queues = ['default', 'ai', 'sms', 'booking', 'crm'];

  // Detect stalls BEFORE draining so we capture the state at tick start and
  // emit diagnostics even if everything then drains successfully this tick.
  const stuck = await detectAndFlagStuckJobs(db);

  const results = await Promise.allSettled(
    queues.map((queueName) => drainQueue(queueName, queueService, workerId, leaseSeconds, batchSize, internalBaseUrl)),
  );

  const stats: QueueRunStats[] = results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : { queue: queues[i], claimed: 0, dispatched: 0, dispatchFailures: 0, claimErrors: 1, error: String(r.reason) },
  );

  const totals = stats.reduce(
    (acc, s) => ({
      claimed: acc.claimed + s.claimed,
      dispatched: acc.dispatched + s.dispatched,
      dispatchFailures: acc.dispatchFailures + s.dispatchFailures,
      claimErrors: acc.claimErrors + s.claimErrors,
    }),
    { claimed: 0, dispatched: 0, dispatchFailures: 0, claimErrors: 0 },
  );

  const healthy = totals.claimErrors === 0 && totals.dispatchFailures === 0 && stuck.count === 0;
  const summaryLine = `[process-queue] worker=${workerId} claimed=${totals.claimed} dispatched=${totals.dispatched} dispatchFailures=${totals.dispatchFailures} claimErrors=${totals.claimErrors} stuckJobs=${stuck.count}`;

  if (healthy) {
    console.log(summaryLine, { per_queue: stats });
  } else {
    console.error(`${summaryLine} UNHEALTHY`, { per_queue: stats, stuck });
    await notifyError('Queue unhealthy', summaryLine, {
      dispatch_failures: totals.dispatchFailures,
      claim_errors: totals.claimErrors,
      stuck_jobs: stuck.count,
    });
  }

  const body = JSON.stringify({
    healthy,
    worker_id: workerId,
    totals,
    queues: stats,
    stuck,
  });

  return new Response(body, {
    status: healthy ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
  });
};

async function drainQueue(
  queueName: string,
  queueService: QueueService,
  workerId: string,
  leaseSeconds: number,
  batchSize: number,
  internalBaseUrl: string,
): Promise<QueueRunStats> {
  const stats: QueueRunStats = {
    queue: queueName,
    claimed: 0,
    dispatched: 0,
    dispatchFailures: 0,
    claimErrors: 0,
  };

  try {
    while (stats.claimed + stats.claimErrors < batchSize) {
      let job;
      try {
        job = await queueService.claimNext(queueName, workerId, leaseSeconds);
      } catch (claimErr) {
        stats.claimErrors += 1;
        console.error(`[process-queue] claim error on queue=${queueName}:`, claimErr);
        break;
      }
      if (!job) break;
      stats.claimed += 1;

      try {
        const handlerUrl = getHandlerUrl(job.job_type, internalBaseUrl);
        if (!handlerUrl) {
          throw new Error(`No handler registered for job type: ${job.job_type}`);
        }

        const response = await fetch(handlerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...job.payload_json,
            job_id: job.id,
            worker_id: workerId,
            lease_seconds: leaseSeconds,
          }),
        });

        // Netlify background functions return 202 Accepted immediately.
        // Treat 2xx as a successful dispatch — the handler is responsible for
        // calling markCompleted/markFailed once it finishes.
        if (!response.ok) {
          const responseText = await response.text().catch(() => '');
          throw new Error(
            `Handler ${job.job_type} dispatch failed with ${response.status}${responseText ? `: ${responseText}` : ''}`,
          );
        }
        stats.dispatched += 1;
      } catch (err) {
        stats.dispatchFailures += 1;
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[process-queue] dispatch failed queue=${queueName} job_id=${job.id} type=${job.job_type}: ${message}`);
        await queueService.markFailed(job.id, workerId, message);
      }
    }
  } catch (err) {
    stats.error = err instanceof Error ? err.message : String(err);
    console.error(`[process-queue] fatal drain error queue=${queueName}:`, err);
  }

  return stats;
}

/**
 * Find pending jobs whose run_at is older than the stuck threshold, log them,
 * and emit a conversation_event for each so the Inbox diagnostics panel shows
 * "<job_type>_stalled" for the affected conversation. Deduped per-conversation
 * within the last 30 minutes so we don't spam events every tick.
 */
async function detectAndFlagStuckJobs(db: SupabaseClient): Promise<{
  count: number;
  oldest_age_seconds: number | null;
  by_queue: Record<string, number>;
  flagged_conversation_ids: string[];
}> {
  const cutoffIso = new Date(Date.now() - STUCK_JOB_THRESHOLD_SECONDS * 1000).toISOString();
  const { data: stuckJobs, error } = await db
    .from('jobs')
    .select('id, job_type, queue_name, run_at, created_at, attempts, payload_json')
    .eq('status', 'pending')
    .lt('run_at', cutoffIso)
    .order('run_at', { ascending: true })
    .limit(100);

  if (error) {
    console.error('[process-queue] stuck-job detector query failed:', error);
    return { count: 0, oldest_age_seconds: null, by_queue: {}, flagged_conversation_ids: [] };
  }

  if (!stuckJobs || stuckJobs.length === 0) {
    return { count: 0, oldest_age_seconds: null, by_queue: {}, flagged_conversation_ids: [] };
  }

  const now = Date.now();
  const oldestAgeSeconds = Math.round((now - new Date(stuckJobs[0].run_at).getTime()) / 1000);
  const byQueue: Record<string, number> = {};
  for (const j of stuckJobs) {
    byQueue[j.queue_name] = (byQueue[j.queue_name] ?? 0) + 1;
  }

  console.warn(
    `[process-queue] STUCK JOBS DETECTED: count=${stuckJobs.length} oldest=${oldestAgeSeconds}s by_queue=${JSON.stringify(byQueue)}`,
  );

  // Dedup window — don't re-emit the same stall event for the same conversation
  // more than once per 30 minutes.
  const dedupeCutoff = new Date(now - 30 * 60 * 1000).toISOString();
  const flagged: string[] = [];

  for (const job of stuckJobs) {
    const payload = (job.payload_json ?? {}) as Record<string, unknown>;
    const conversationId = typeof payload.conversation_id === 'string' ? payload.conversation_id : null;
    if (!conversationId) continue;

    const eventType = `${job.job_type}_stalled`;
    const { data: existing } = await db
      .from('conversation_events')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('event_type', eventType)
      .gt('created_at', dedupeCutoff)
      .limit(1);

    if (existing && existing.length > 0) continue;

    const { error: insertError } = await db.from('conversation_events').insert({
      conversation_id: conversationId,
      event_type: eventType,
      event_payload_json: {
        job_id: job.id,
        job_type: job.job_type,
        queue_name: job.queue_name,
        run_at: job.run_at,
        age_seconds: Math.round((now - new Date(job.run_at).getTime()) / 1000),
        attempts: job.attempts,
        threshold_seconds: STUCK_JOB_THRESHOLD_SECONDS,
      },
    });

    if (insertError) {
      console.error(`[process-queue] failed to emit ${eventType} for conversation=${conversationId}:`, insertError);
    } else {
      flagged.push(conversationId);
    }
  }

  return {
    count: stuckJobs.length,
    oldest_age_seconds: oldestAgeSeconds,
    by_queue: byQueue,
    flagged_conversation_ids: flagged,
  };
}

function getHandlerUrl(jobType: string, baseUrl: string): string | null {
  // Use the native Netlify background-function path so dispatch returns 202
  // immediately and the handler runs in the background. Going through the
  // Astro route (/api/...) executes the handler inline and blocks dispatch.
  const handlers: Record<string, string> = {
    generate_ai_reply: `${baseUrl}/.netlify/functions/process-ai-reply-background`,
    send_sms: `${baseUrl}/.netlify/functions/process-send-sms-background`,
    process_send_sms: `${baseUrl}/.netlify/functions/process-send-sms-background`,
    process_booking: `${baseUrl}/.netlify/functions/process-booking-background`,
    process_crm_sync: `${baseUrl}/.netlify/functions/process-crm-sync-background`,
  };
  return handlers[jobType] ?? null;
}
