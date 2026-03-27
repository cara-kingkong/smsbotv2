import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

/**
 * List versions for an agent.
 * GET /.netlify/functions/api-agent-versions-list?agent_id=...
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const url = new URL(req.url);
    const agentId = url.searchParams.get('agent_id');

    if (!agentId) {
      return new Response(JSON.stringify({ error: 'agent_id is required' }), { status: 400 });
    }

    const { data: agent, error: agentError } = await db
      .from('agents')
      .select('id, campaigns!inner(workspace_id)')
      .eq('id', agentId)
      .is('deleted_at', null)
      .single();

    if (agentError || !agent) {
      return new Response(JSON.stringify({ error: 'Agent not found' }), { status: 404 });
    }

    const workspaceId = (agent.campaigns as { workspace_id: string } | null)?.workspace_id;
    const access = await requireWorkspaceAccess(req, workspaceId);
    if (access instanceof Response) return access;

    const { data, error } = await db
      .from('agent_versions')
      .select('*')
      .eq('agent_id', agentId)
      .order('version_number', { ascending: false });

    if (error) throw new Error(`Failed to list agent versions: ${error.message}`);

    return new Response(JSON.stringify(data ?? []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-agent-versions-list error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
