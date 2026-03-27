import type { Context } from '@netlify/functions';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

/**
 * Get workspace settings (business hours + stop conditions).
 * GET /.netlify/functions/api-workspace-settings-get?workspace_id=...
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get('workspace_id');
    const access = await requireWorkspaceAccess(req, workspaceId);
    if (access instanceof Response) return access;

    return new Response(JSON.stringify({
      id: access.workspace.id,
      name: access.workspace.name,
      business_hours_json: access.workspace.business_hours_json,
      stop_conditions_json: access.workspace.stop_conditions_json,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-workspace-settings-get error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
