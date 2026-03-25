import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';

/**
 * Retry a failed or dead-lettered job.
 * POST /.netlify/functions/api-jobs-retry
 *
 * Body: { job_id }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const body = await req.json();
    const { job_id } = body;

    if (!job_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: job_id' }),
        { status: 400 },
      );
    }

    // Verify the job exists and is in a retryable state
    const { data: existing, error: fetchError } = await db
      .from('jobs')
      .select('id, status')
      .eq('id', job_id)
      .single();

    if (fetchError || !existing) {
      return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404 });
    }

    const retryableStatuses = ['failed', 'dead_lettered'];
    if (!retryableStatuses.includes(existing.status)) {
      return new Response(
        JSON.stringify({ error: `Job cannot be retried from status: ${existing.status}` }),
        { status: 422 },
      );
    }

    const { data: updated, error: updateError } = await db
      .from('jobs')
      .update({
        status: 'queued',
        attempts: 0,
        last_error: null,
        dead_lettered_at: null,
        run_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job_id)
      .select()
      .single();

    if (updateError) throw new Error(`Failed to retry job: ${updateError.message}`);

    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-jobs-retry error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
