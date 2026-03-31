import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@lib/db/client';
import { QueueService } from '@lib/queues/service';

interface QueueJobMeta {
  job_id?: string;
  worker_id?: string;
  lease_seconds?: number;
}

export interface QueueJobContext {
  db: SupabaseClient;
  queueService: QueueService;
  heartbeat: () => Promise<void>;
  jobId?: string;
  workerId?: string;
  leaseSeconds: number;
}

type QueueJobPayload<T> = T & QueueJobMeta;

export async function runQueueJob<T extends Record<string, unknown>>(
  req: Request,
  label: string,
  handler: (payload: QueueJobPayload<T>, context: QueueJobContext) => Promise<Response | void>,
): Promise<Response> {
  const db = getServiceClient();
  const queueService = new QueueService(db);

  let payload: QueueJobPayload<T>;

  try {
    payload = await req.json() as QueueJobPayload<T>;
  } catch (err) {
    console.error(`${label} invalid payload:`, err);
    return new Response('Invalid payload', { status: 400 });
  }

  const jobId = payload.job_id;
  const workerId = payload.worker_id;
  const leaseSeconds = payload.lease_seconds ?? 90;

  const heartbeat = async () => {
    if (!jobId || !workerId) return;
    await queueService.heartbeat(jobId, workerId, leaseSeconds);
  };

  try {
    await heartbeat();
    const response = await handler(payload, { db, queueService, heartbeat, jobId, workerId, leaseSeconds });

    if (jobId && workerId) {
      await queueService.markCompleted(jobId, workerId);
    }

    return response ?? new Response('OK', { status: 200 });
  } catch (err) {
    console.error(`${label} error:`, err);

    if (jobId && workerId) {
      try {
        await queueService.markFailed(jobId, workerId, err instanceof Error ? err.message : 'Unknown error');
      } catch (markErr) {
        console.error(`${label} failed to mark job ${jobId} as failed:`, markErr);
      }
    }

    return new Response('Error', { status: 500 });
  }
}
