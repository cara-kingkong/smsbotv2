import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { JobStatus } from '../../src/lib/types';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

/**
 * List jobs in the queue for a workspace.
 * GET /.netlify/functions/api-jobs-list?workspace_id=...&status=...&limit=...
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get('workspace_id');
    const access = await requireWorkspaceAccess(req, workspaceId);
    if (access instanceof Response) return access;

    const parsedLimit = Number.parseInt(url.searchParams.get('limit') ?? '50', 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 50;
    const status = url.searchParams.get('status')?.trim();

    const validStatuses = Object.values(JobStatus);

    if (status && !validStatuses.includes(status)) {
      return new Response(
        JSON.stringify({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }),
        { status: 400 },
      );
    }

    let query = db
      .from('jobs')
      .select('*')
      .eq('workspace_id', access.workspace.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Failed to list jobs: ${error.message}`);

    return new Response(JSON.stringify(data ?? []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-jobs-list error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
