import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { AgentService } from '../../src/lib/agents/service';

/**
 * List all agents for a workspace (across all campaigns).
 * GET /.netlify/functions/api-agents-workspace-list?workspace_id=...
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

    const agentService = new AgentService(db);
    const agents = await agentService.listByWorkspace(workspaceId);

    return new Response(JSON.stringify(agents), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-agents-workspace-list error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
