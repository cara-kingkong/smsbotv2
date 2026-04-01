import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { AgentService } from '../../src/lib/agents/service';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

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
    const access = await requireWorkspaceAccess(req, workspaceId);
    if (access instanceof Response) return access;

    const agentService = new AgentService(db);
    const agents = await agentService.listByWorkspace(access.workspace.id);

    return new Response(JSON.stringify(agents), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=15, stale-while-revalidate=30',
      },
    });
  } catch (err) {
    console.error('api-agents-workspace-list error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
