import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { CalendarManagementService } from '../../src/lib/calendar/management';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';
import { requireRole } from '../../src/lib/auth/permissions';
import { WorkspaceRole } from '../../src/lib/types';

/**
 * Assign a calendar to an agent.
 * POST /.netlify/functions/api-agent-calendars-assign
 *
 * Body: { workspace_id, agent_id, calendar_id }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const body = await req.json();
    const { workspace_id, agent_id, calendar_id } = body;

    if (!workspace_id || !agent_id || !calendar_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: workspace_id, agent_id, calendar_id' }),
        { status: 400 },
      );
    }

    const access = await requireWorkspaceAccess(req, workspace_id);
    if (access instanceof Response) return access;
    const guard = requireRole(access, WorkspaceRole.Manager);
    if (guard instanceof Response) return guard;

    // Verify calendar belongs to this workspace
    const { data: calendar, error: calError } = await db
      .from('calendars')
      .select('id')
      .eq('id', calendar_id)
      .eq('workspace_id', access.workspace.id)
      .is('deleted_at', null)
      .single();

    if (calError || !calendar) {
      return new Response(
        JSON.stringify({ error: 'Calendar not found in this workspace' }),
        { status: 404 },
      );
    }

    const service = new CalendarManagementService(db);
    const assignment = await service.assignToAgent({
      workspace_id: access.workspace.id,
      agent_id,
      calendar_id,
    });

    return new Response(JSON.stringify(assignment), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = message.includes('already assigned') ? 409 : 500;
    console.error('api-agent-calendars-assign error:', err);
    return new Response(
      JSON.stringify({ error: message }),
      { status },
    );
  }
};
