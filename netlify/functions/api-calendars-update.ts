import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { CalendarManagementService } from '../../src/lib/calendar/management';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

/**
 * Update a calendar target.
 * PUT /.netlify/functions/api-calendars-update
 *
 * Body: { calendar_id, workspace_id, name?, eligibility_rules_json?, status?, settings_json? }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'PUT') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const body = await req.json();
    const { calendar_id, workspace_id, name, eligibility_rules_json, status, settings_json } = body;

    if (!calendar_id || !workspace_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: calendar_id, workspace_id' }),
        { status: 400 },
      );
    }

    const access = await requireWorkspaceAccess(req, workspace_id);
    if (access instanceof Response) return access;

    // Verify calendar belongs to this workspace
    const { data: existing, error: findError } = await db
      .from('calendars')
      .select('id')
      .eq('id', calendar_id)
      .eq('workspace_id', access.workspace.id)
      .is('deleted_at', null)
      .single();

    if (findError || !existing) {
      return new Response(
        JSON.stringify({ error: 'Calendar not found in this workspace' }),
        { status: 404 },
      );
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (eligibility_rules_json !== undefined) updates.eligibility_rules_json = eligibility_rules_json;
    if (status !== undefined) updates.status = status;
    if (settings_json !== undefined) updates.settings_json = settings_json;

    const service = new CalendarManagementService(db);
    const calendar = await service.update(calendar_id, updates);

    return new Response(JSON.stringify(calendar), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-calendars-update error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
