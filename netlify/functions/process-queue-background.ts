import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { QueueService } from '../../src/lib/queues/service';

/**
 * Background function: Process pending jobs from the queue.
 * Can be triggered on a schedule or via Netlify scheduled functions.
 */
export default async (_req: Request, _context: Context) => {
  const db = getServiceClient();
  const queueService = new QueueService(db);

  const queues = ['default', 'ai', 'sms', 'booking', 'crm'];

  for (const queueName of queues) {
    try {
      // Fetch pending jobs that are ready to run
      const { data: jobs, error } = await db
        .from('jobs')
        .select('*')
        .eq('queue_name', queueName)
        .eq('status', 'pending')
        .lte('run_at', new Date().toISOString())
        .order('run_at', { ascending: true })
        .limit(10);

      if (error || !jobs?.length) continue;

      for (const job of jobs) {
        try {
          // Mark as running
          await db.from('jobs').update({ status: 'running' }).eq('id', job.id);

          // Dispatch to appropriate handler based on job_type
          const handlerUrl = getHandlerUrl(job.job_type);
          if (handlerUrl) {
            await fetch(handlerUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(job.payload_json),
            });
          }

          await queueService.markCompleted(job.id);
        } catch (err) {
          await queueService.markFailed(job.id, err instanceof Error ? err.message : 'Unknown error');
        }
      }
    } catch (err) {
      console.error(`Queue processing error for ${queueName}:`, err);
    }
  }

  return new Response('OK', { status: 200 });
};

function getHandlerUrl(jobType: string): string | null {
  const baseUrl = process.env.PUBLIC_SITE_URL ?? 'http://localhost:8888';
  const handlers: Record<string, string> = {
    generate_ai_reply: `${baseUrl}/.netlify/functions/process-ai-reply-background`,
    send_sms: `${baseUrl}/.netlify/functions/process-send-sms-background`,
    process_booking: `${baseUrl}/.netlify/functions/process-booking-background`,
    process_crm_sync: `${baseUrl}/.netlify/functions/process-crm-sync-background`,
  };
  return handlers[jobType] ?? null;
}
