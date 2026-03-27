import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { AgentService } from '../../src/lib/agents/service';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

/**
 * Activate a specific version for an agent.
 * POST /.netlify/functions/api-agent-versions-activate
 *
 * Body: { agent_id, version_id }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const body = await req.json();
    const { agent_id, version_id } = body;

    if (!agent_id || !version_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: agent_id, version_id' }),
        { status: 400 },
      );
    }

    const { data: agent, error: agentError } = await db
      .from('agents')
      .select('id, campaigns!inner(workspace_id)')
      .eq('id', agent_id)
      .is('deleted_at', null)
      .single();

    if (agentError || !agent) {
      return new Response(JSON.stringify({ error: 'Agent not found' }), { status: 404 });
    }

    const workspaceId = (agent.campaigns as { workspace_id: string } | null)?.workspace_id;
    const access = await requireWorkspaceAccess(req, workspaceId);
    if (access instanceof Response) return access;

    const agentService = new AgentService(db);
    const version = await agentService.activateVersion(agent_id, version_id);

    return new Response(JSON.stringify(version), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-agent-versions-activate error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
