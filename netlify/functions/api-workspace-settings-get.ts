import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { WorkspaceService } from '../../src/lib/workspaces/service';

/**
 * Get workspace settings (business hours + stop conditions).
 * GET /.netlify/functions/api-workspace-settings-get?workspace_id=...
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
      return new Response(JSON.stringify({ error: 'Missing workspace_id' }), { status: 400 });
    }

    const workspaceService = new WorkspaceService(db);
    const workspace = await workspaceService.getById(workspaceId);

    if (!workspace) {
      return new Response(JSON.stringify({ error: 'Workspace not found' }), { status: 404 });
    }

    return new Response(JSON.stringify({
      id: workspace.id,
      name: workspace.name,
      business_hours_json: workspace.business_hours_json,
      stop_conditions_json: workspace.stop_conditions_json,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-workspace-settings-get error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
