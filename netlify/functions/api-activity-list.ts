import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';

/**
 * List activity logs for a workspace.
 * GET /.netlify/functions/api-activity-list?workspace_id=...&entity_type=...&limit=...
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get('workspace_id');

    if (!workspaceId) {
      return new Response(JSON.stringify({ error: 'workspace_id is required' }), { status: 400 });
    }

    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
    const entityType = url.searchParams.get('entity_type')?.trim();

    let query = db
      .from('activity_logs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (entityType) {
      query = query.eq('entity_type', entityType);
    }

    query = query.limit(limit);

    const { data, error } = await query;

    if (error) throw new Error(`Failed to list activity logs: ${error.message}`);

    return new Response(JSON.stringify(data ?? []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-activity-list error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
