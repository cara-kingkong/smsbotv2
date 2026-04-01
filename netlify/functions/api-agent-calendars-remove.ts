import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { CalendarManagementService } from '../../src/lib/calendar/management';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

/**
 * Remove a calendar assignment from an agent.
 * DELETE /.netlify/functions/api-agent-calendars-remove
 *
 * Body: { workspace_id, agent_id, calendar_id }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'DELETE') {
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

    const service = new CalendarManagementService(db);
    await service.removeFromAgent(agent_id, calendar_id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-agent-calendars-remove error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
