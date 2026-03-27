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
  async claimNext(queueName: string): Promise<Job | null> {
    const { data, error } = await this.db.rpc('claim_next_job', {
      p_queue_name: queueName,
    });

    if (error || !data) return null;

    const claimed = data as Job;
    if (claimed.status === JobStatus.Running) return claimed;

    return {
      ...claimed,
      status: JobStatus.Running,
      attempts: (claimed.attempts ?? 0) + 1,
    };
  }

  async markCompleted(jobId: string): Promise<void> {
    await this.db
      .from('jobs')
      .update({ status: JobStatus.Completed })
      .eq('id', jobId);
  }

  async markFailed(jobId: string, errorMessage: string): Promise<void> {
    const { data: job } = await this.db
      .from('jobs')
      .select('attempts, max_attempts')
      .eq('id', jobId)
      .single();

    if (!job) return;

    const attempts = job.attempts ?? 0;
    const maxAttempts = job.max_attempts ?? 3;
    const shouldDeadLetter = attempts >= maxAttempts;

    await this.db
      .from('jobs')
      .update({
        status: shouldDeadLetter ? JobStatus.DeadLettered : JobStatus.Failed,
        last_error: errorMessage,
        ...(shouldDeadLetter ? { dead_lettered_at: new Date().toISOString() } : {}),
      })
      .eq('id', jobId);
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
        run_at: new Date().toISOString(),
        dead_lettered_at: null,
      })
      .eq('id', jobId)
      .select()
      .single();

    if (error) throw new Error(`Failed to retry job: ${error.message}`);
    return data;
  }
}
