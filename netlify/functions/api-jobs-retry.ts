import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { JobStatus, WorkspaceRole } from '../../src/lib/types';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';
import { requireRole } from '../../src/lib/auth/permissions';

/**
 * Retry a failed or dead-lettered job within a workspace.
 * POST /.netlify/functions/api-jobs-retry
 *
 * Body: { workspace_id?, job_id }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const body = await req.json();
    const { workspace_id, job_id } = body;

    if (!job_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: job_id' }),
        { status: 400 },
      );
    }

    // Verify the job exists in the current workspace and is in a retryable state
    const { data: existing, error: fetchError } = await db
      .from('jobs')
      .select('id, status, workspace_id')
      .eq('id', job_id)
      .single();

    if (fetchError || !existing) {
      return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404 });
    }

    const access = await requireWorkspaceAccess(req, existing.workspace_id);
    if (access instanceof Response) return access;
    const guard = requireRole(access, WorkspaceRole.Admin);
    if (guard instanceof Response) return guard;

    if (workspace_id && workspace_id !== existing.workspace_id) {
      return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404 });
    }

    const retryableStatuses = [JobStatus.Failed, JobStatus.DeadLettered, JobStatus.Pending];
    if (!retryableStatuses.includes(existing.status)) {
      return new Response(
        JSON.stringify({ error: `Job cannot be retried from status: ${existing.status}` }),
        { status: 422 },
      );
    }

    const { data: updated, error: updateError } = await db
      .from('jobs')
      .update({
        status: JobStatus.Pending,
        attempts: 0,
        last_error: null,
        dead_lettered_at: null,
        run_at: new Date().toISOString(),
      })
      .eq('id', job_id)
      .eq('workspace_id', existing.workspace_id)
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
