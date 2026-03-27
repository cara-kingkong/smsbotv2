import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

/**
 * Fetch dashboard stats for a workspace.
 * GET /.netlify/functions/api-dashboard-stats?workspace_id=...
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

    // Fetch all non-deleted conversations for workspace
    const { data: conversations, error } = await db
      .from('conversations')
      .select('id, status, outcome')
      .eq('workspace_id', access.workspace.id)
      .is('deleted_at', null);

    if (error) throw new Error(`Failed to fetch stats: ${error.message}`);

    const rows = conversations ?? [];

    const stats = {
      total: rows.length,
      active: rows.filter(c => c.status === 'active' || c.status === 'waiting_for_lead').length,
      booked: rows.filter(c => c.outcome === 'booked').length,
      qualified: rows.filter(c => c.outcome === 'qualified_not_booked').length,
      opted_out: rows.filter(c => c.status === 'opted_out').length,
      needs_human: rows.filter(c => c.status === 'needs_human' || c.status === 'human_controlled').length,
    };

    return new Response(JSON.stringify(stats), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-dashboard-stats error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
