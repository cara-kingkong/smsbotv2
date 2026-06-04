import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

/**
 * List debug conversations for a workspace.
 * GET /.netlify/functions/api-debug-conversation-list?workspace_id=...
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

    const { data, error } = await db
      .from('conversations')
      .select(`
        id, status, outcome, last_activity_at, campaign_id, agent_id, opened_at,
        last_message_preview, last_message_sender_type, last_message_at,
        lead:leads(id, first_name, last_name, email)
      `)
      .eq('workspace_id', access.workspace.id)
      .eq('is_test', true)
      .is('deleted_at', null)
      .order('last_activity_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to list debug conversations: ${error.message}`);

    return new Response(JSON.stringify(data ?? []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-debug-conversation-list error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500 },
    );
  }
};
