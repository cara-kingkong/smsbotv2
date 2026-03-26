import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { WorkspaceService } from '../../src/lib/workspaces/service';

/**
 * Update workspace settings (business hours + stop conditions).
 * PUT /.netlify/functions/api-workspace-settings-update
 *
 * Body: { workspace_id, business_hours_json?, stop_conditions_json? }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'PUT') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const body = await req.json();
    const { workspace_id, business_hours_json, stop_conditions_json } = body;

    if (!workspace_id) {
      return new Response(JSON.stringify({ error: 'Missing workspace_id' }), { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (business_hours_json !== undefined) updates.business_hours_json = business_hours_json;
    if (stop_conditions_json !== undefined) updates.stop_conditions_json = stop_conditions_json;

    if (Object.keys(updates).length === 0) {
      return new Response(JSON.stringify({ error: 'No update fields provided' }), { status: 400 });
    }

    const workspaceService = new WorkspaceService(db);
    const workspace = await workspaceService.update(workspace_id, updates);

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
    console.error('api-workspace-settings-update error:', err);
    const message = err instanceof Error ? err.message : 'Internal error';

    if (message.includes('Failed to update workspace')) {
      return new Response(JSON.stringify({ error: 'Workspace not found or update failed' }), { status: 404 });
    }

    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
