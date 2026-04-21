import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { CalendarManagementService } from '../../src/lib/calendar/management';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';
import { requireRole } from '../../src/lib/auth/permissions';
import { WorkspaceRole } from '../../src/lib/types';

/**
 * Create a calendar target for a workspace.
 * POST /.netlify/functions/api-calendars-create
 *
 * Body: { workspace_id, integration_id, name, external_calendar_id?, booking_url?, eligibility_rules_json? }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const body = await req.json();
    const { workspace_id, integration_id, name, external_calendar_id, booking_url, eligibility_rules_json } = body;

    if (!workspace_id || !integration_id || !name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: workspace_id, integration_id, name' }),
        { status: 400 },
      );
    }

    const access = await requireWorkspaceAccess(req, workspace_id);
    if (access instanceof Response) return access;
    const guard = requireRole(access, WorkspaceRole.Manager);
    if (guard instanceof Response) return guard;

    // Verify integration belongs to this workspace
    const { data: integration, error: intError } = await db
      .from('integrations')
      .select('id, workspace_id, type')
      .eq('id', integration_id)
      .eq('workspace_id', access.workspace.id)
      .single();

    if (intError || !integration) {
      return new Response(
        JSON.stringify({ error: 'Integration not found in this workspace' }),
        { status: 404 },
      );
    }

    if (integration.type !== 'calendar') {
      return new Response(
        JSON.stringify({ error: 'Integration is not a calendar type' }),
        { status: 400 },
      );
    }

    const service = new CalendarManagementService(db);
    const calendar = await service.create({
      workspace_id: access.workspace.id,
      integration_id,
      name,
      external_calendar_id,
      booking_url,
      eligibility_rules_json,
    });

    return new Response(JSON.stringify(calendar), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-calendars-create error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
