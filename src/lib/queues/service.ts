import type { SupabaseClient } from '@supabase/supabase-js';
import type { Job } from '@lib/types';
import { JobStatus } from '@lib/types';

export interface EnqueueInput {
  workspace_id: string;
  job_type: string;
  queue_name?: string;
  payload: Record<string, unknown>;
  run_at?: Date;
  max_attempts?: number;
}

/**
 * Postgres-backed job queue using the jobs table.
 * Netlify Background Functions poll and process jobs.
 */
export class QueueService {
  constructor(private readonly db: SupabaseClient) {}

  async enqueue(input: EnqueueInput): Promise<Job> {
    const { data, error } = await this.db
      .from('jobs')
      .insert({
        workspace_id: input.workspace_id,
        job_type: input.job_type,
        queue_name: input.queue_name ?? 'default',
        status: JobStatus.Pending,
        payload_json: input.payload,
        run_at: (input.run_at ?? new Date()).toISOString(),
        max_attempts: input.max_attempts ?? 3,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to enqueue job: ${error.message}`);
    return data;
  }

  /** Claim the next pending job for processing (atomic) */
  async claimNext(queueName: string, workerId: string, leaseSeconds = 90): Promise<Job | null> {
    const { data, error } = await this.db.rpc('claim_next_job', {
      p_queue_name: queueName,
      p_worker_id: workerId,
      p_lease_seconds: leaseSeconds,
    });

    if (error) {
      // Never swallow: a misconfigured RPC (e.g. stale function signature) here
      // silently stalls every queue. Surface it so process-queue can alert.
      console.error(
        `[QueueService.claimNext] RPC failed for queue=${queueName} worker=${workerId}:`,
        error,
      );
      return null;
    }
    if (!data) return null;
    return data as Job;
  }

  async heartbeat(jobId: string, workerId: string, leaseSeconds = 90): Promise<void> {
    await this.db
      .from('jobs')
      .update({
        heartbeat_at: new Date().toISOString(),
        lease_expires_at: new Date(Date.now() + Math.max(leaseSeconds, 15) * 1000).toISOString(),
      })
      .eq('id', jobId)
      .eq('worker_id', workerId)
      .eq('status', JobStatus.Running);
  }

  async markCompleted(jobId: string, workerId: string): Promise<void> {
    await this.db
      .from('jobs')
      .update({
        status: JobStatus.Completed,
        completed_at: new Date().toISOString(),
        heartbeat_at: new Date().toISOString(),
        lease_expires_at: null,
        worker_id: null,
      })
      .eq('id', jobId)
      .eq('worker_id', workerId)
      .eq('status', JobStatus.Running);
  }

  async markFailed(jobId: string, workerId: string, errorMessage: string): Promise<void> {
    const { data: job } = await this.db
      .from('jobs')
      .select('attempts, max_attempts')
      .eq('id', jobId)
      .eq('worker_id', workerId)
      .eq('status', JobStatus.Running)
      .single();

    if (!job) return;

    const attempts = job.attempts ?? 0;
    const maxAttempts = job.max_attempts ?? 3;
    const shouldDeadLetter = attempts >= maxAttempts;
    const retryDelaySeconds = shouldDeadLetter
      ? 0
      : Math.min(300, 5 * 2 ** Math.max(0, attempts - 1));
    const retryAt = new Date(Date.now() + retryDelaySeconds * 1000).toISOString();
    const updates: Record<string, unknown> = {
      status: shouldDeadLetter ? JobStatus.DeadLettered : JobStatus.Pending,
      last_error: errorMessage,
      last_error_at: new Date().toISOString(),
      heartbeat_at: null,
      lease_expires_at: null,
      worker_id: null,
    };

    if (shouldDeadLetter) {
      updates.dead_lettered_at = new Date().toISOString();
    } else {
      updates.run_at = retryAt;
    }

    await this.db
      .from('jobs')
      .update(updates)
      .eq('id', jobId);
  }

  async cancelByConversation(conversationId: string): Promise<void> {
    await this.db
      .from('jobs')
      .update({
        status: JobStatus.Cancelled,
        lease_expires_at: null,
        worker_id: null,
        heartbeat_at: null,
        completed_at: new Date().toISOString(),
      })
      .in('status', [JobStatus.Pending, JobStatus.Running, JobStatus.Failed])
      .contains('payload_json', { conversation_id: conversationId });
  }

  /**
   * Cancel only pending AI reply jobs for a conversation.
   * Used by the inbound-message debounce: each new rapid-fire message
   * cancels the waiting job so a fresh one can be enqueued with a reset timer.
   * Only targets `pending` status to avoid touching jobs already being processed.
   */
  async cancelPendingAIReplies(conversationId: string): Promise<number> {
    const { data } = await this.db
      .from('jobs')
      .update({
        status: JobStatus.Cancelled,
        lease_expires_at: null,
        worker_id: null,
        heartbeat_at: null,
        completed_at: new Date().toISOString(),
      })
      .eq('status', JobStatus.Pending)
      .eq('job_type', 'generate_ai_reply')
      .contains('payload_json', { conversation_id: conversationId })
      .select('id');

    return data?.length ?? 0;
  }

  async listDeadLettered(queueName?: string): Promise<Job[]> {
    let query = this.db
      .from('jobs')
      .select('*')
      .eq('status', JobStatus.DeadLettered)
      .order('created_at', { ascending: false });

    if (queueName) query = query.eq('queue_name', queueName);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to list dead-lettered jobs: ${error.message}`);
    return data ?? [];
  }

  async retry(jobId: string): Promise<Job> {
    const { data, error } = await this.db
      .from('jobs')
      .update({
        status: JobStatus.Pending,
        worker_id: null,
        heartbeat_at: null,
        lease_expires_at: null,
        completed_at: null,
        run_at: new Date().toISOString(),
        dead_lettered_at: null,
        last_error: null,
        last_error_at: null,
      })
      .eq('id', jobId)
      .select()
      .single();

    if (error) throw new Error(`Failed to retry job: ${error.message}`);
    return data;
  }
}
