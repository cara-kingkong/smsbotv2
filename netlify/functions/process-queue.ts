import type { Config, Context } from '@netlify/functions';
import { randomUUID } from 'node:crypto';
import { getServiceClient } from '../../src/lib/db/client';
import { QueueService } from '../../src/lib/queues/service';

/** Run every minute on Netlify */
export const config: Config = {
  schedule: '* * * * *',
};

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
 */
export default async (_req: Request, _context: Context) => {
  const internalBaseUrl = new URL(_req.url).origin;
  const db = getServiceClient();
  const queueService = new QueueService(db);
  const workerId = `queue-runner:${randomUUID()}`;
  const leaseSeconds = parseInt(process.env.QUEUE_LEASE_SECONDS ?? '90', 10);
  const batchSize = parseInt(process.env.QUEUE_BATCH_SIZE ?? '25', 10);

  const queues = ['default', 'ai', 'sms', 'booking', 'crm'];

  await Promise.allSettled(
    queues.map((queueName) => drainQueue(queueName, queueService, workerId, leaseSeconds, batchSize, internalBaseUrl)),
  );

  return new Response('OK', { status: 200 });
};

async function drainQueue(
  queueName: string,
  queueService: QueueService,
  workerId: string,
  leaseSeconds: number,
  batchSize: number,
  internalBaseUrl: string,
): Promise<void> {
  let processed = 0;

  try {
    while (processed < batchSize) {
      const job = await queueService.claimNext(queueName, workerId, leaseSeconds);
      if (!job) break;

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
      } catch (err) {
        await queueService.markFailed(job.id, workerId, err instanceof Error ? err.message : 'Unknown error');
      }

      processed += 1;
    }
  } catch (err) {
    console.error(`Queue processing error for ${queueName}:`, err);
  }
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
