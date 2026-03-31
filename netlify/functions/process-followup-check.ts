import type { Config, Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { QueueService } from '../../src/lib/queues/service';
import { JobStatus } from '../../src/lib/types';

export const config: Config = {
  schedule: '*/5 * * * *',
};

/**
 * Safety-net scheduled function: finds conversations stuck in "waiting_for_lead"
 * that have exceeded their follow-up delay and don't already have a pending job.
 *
 * Intended to run on a cron schedule (e.g. every 5 minutes) to catch any
 * follow-ups that the inline scheduling in process-ai-reply-background missed.
 */
export default async (_req: Request, _context: Context) => {
  const db = getServiceClient();

  try {
    // Fetch conversations waiting for lead, joined with their agent version cadence.
    // We look for conversations whose last_activity_at is older than the
    // configured followup_delay_seconds on the active agent version.
    const { data: conversations, error: convError } = await db
      .from('conversations')
      .select(`
        id,
        agent_id,
        workspace_id,
        last_activity_at
      `)
      .eq('status', 'waiting_for_lead')
      .eq('human_controlled', false);

    if (convError) {
      console.error('process-followup-check: failed to query conversations', convError);
      return new Response('Error', { status: 500 });
    }

    if (!conversations || conversations.length === 0) {
      return new Response('No conversations to check', { status: 200 });
    }

    // Collect unique agent IDs so we can batch-fetch active versions
    const agentIds = [...new Set(conversations.map((c) => c.agent_id))];

    const { data: versions, error: verError } = await db
      .from('agent_versions')
      .select('agent_id, reply_cadence_json')
      .in('agent_id', agentIds)
      .eq('is_active', true);

    if (verError) {
      console.error('process-followup-check: failed to query agent versions', verError);
      return new Response('Error', { status: 500 });
    }

    const cadenceByAgent = new Map<string, { followup_delay_seconds: number; max_followups: number }>();
    for (const v of versions ?? []) {
      if (v.reply_cadence_json) {
        cadenceByAgent.set(v.agent_id, v.reply_cadence_json);
      }
    }

    const queueService = new QueueService(db);
    let scheduled = 0;

    for (const conv of conversations) {
      const cadence = cadenceByAgent.get(conv.agent_id);
      if (!cadence || cadence.max_followups <= 0 || cadence.followup_delay_seconds <= 0) {
        continue;
      }

      // Check if enough time has elapsed since last activity
      const lastActivity = new Date(conv.last_activity_at).getTime();
      const threshold = Date.now() - cadence.followup_delay_seconds * 1000;
      if (lastActivity > threshold) {
        continue; // Not yet time for a follow-up
      }

      // Count existing AI replies to enforce max_followups
      const { count: replyCount } = await db
        .from('conversation_events')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .eq('event_type', 'ai_reply_generated');

      if ((replyCount ?? 0) >= cadence.max_followups) {
        continue; // Already hit the limit
      }

      // Check for an existing pending/running job for this conversation
      const { data: existingJobs } = await db
        .from('jobs')
        .select('id')
        .eq('workspace_id', conv.workspace_id)
        .eq('job_type', 'generate_ai_reply')
        .in('status', [JobStatus.Pending, JobStatus.Running])
        .contains('payload_json', { conversation_id: conv.id })
        .limit(1);

      if (existingJobs && existingJobs.length > 0) {
        continue; // Already has a pending follow-up job
      }

      // Schedule the follow-up
      await queueService.enqueue({
        workspace_id: conv.workspace_id,
        job_type: 'generate_ai_reply',
        queue_name: 'ai',
        payload: { conversation_id: conv.id, trigger: 'followup_scheduled' },
        max_attempts: 1,
      });

      scheduled++;
      console.log(`process-followup-check: scheduled follow-up for conversation ${conv.id}`);
    }

    console.log(`process-followup-check: scheduled ${scheduled} follow-up(s) out of ${conversations.length} checked`);
    return new Response(JSON.stringify({ checked: conversations.length, scheduled }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('process-followup-check error:', err);
    return new Response('Error', { status: 500 });
  }
};
