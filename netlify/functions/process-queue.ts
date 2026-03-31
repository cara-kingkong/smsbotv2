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
 */
export default async (_req: Request, _context: Context) => {
  const internalBaseUrl = new URL(_req.url).origin;
  const db = getServiceClient();
  const queueService = new QueueService(db);
  const workerId = `queue-runner:${randomUUID()}`;
  const leaseSeconds = parseInt(process.env.QUEUE_LEASE_SECONDS ?? '90', 10);
  const batchSize = parseInt(process.env.QUEUE_BATCH_SIZE ?? '25', 10);

  const queues = ['default', 'ai', 'sms', 'booking', 'crm'];

  for (const queueName of queues) {
    try {
      let processed = 0;

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

  return new Response('OK', { status: 200 });
};

function getHandlerUrl(jobType: string, baseUrl: string): string | null {
  const handlers: Record<string, string> = {
    generate_ai_reply: `${baseUrl}/api/process-ai-reply-background`,
    send_sms: `${baseUrl}/api/process-send-sms-background`,
    process_booking: `${baseUrl}/api/process-booking-background`,
    process_crm_sync: `${baseUrl}/api/process-crm-sync-background`,
  };
  return handlers[jobType] ?? null;
}
