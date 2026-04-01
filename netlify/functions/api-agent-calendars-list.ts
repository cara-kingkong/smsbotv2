import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { CalendarManagementService } from '../../src/lib/calendar/management';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

/**
 * List calendars assigned to an agent.
 * GET /.netlify/functions/api-agent-calendars-list?workspace_id=...&agent_id=...
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get('workspace_id');
    const agentId = url.searchParams.get('agent_id');

    if (!agentId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: agent_id' }),
        { status: 400 },
      );
    }

    const access = await requireWorkspaceAccess(req, workspaceId);
    if (access instanceof Response) return access;

    const service = new CalendarManagementService(db);
    const calendars = await service.listForAgent(agentId);

    return new Response(JSON.stringify(calendars), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-agent-calendars-list error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
