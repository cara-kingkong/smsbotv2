import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { CalendarManagementService } from '../../src/lib/calendar/management';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';
import { requireRole } from '../../src/lib/auth/permissions';
import { WorkspaceRole } from '../../src/lib/types';

/**
 * Soft-delete a calendar target.
 * DELETE /.netlify/functions/api-calendars-delete
 *
 * Body: { calendar_id, workspace_id }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'DELETE') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const body = await req.json();
    const { calendar_id, workspace_id } = body;

    if (!calendar_id || !workspace_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: calendar_id, workspace_id' }),
        { status: 400 },
      );
    }

    const access = await requireWorkspaceAccess(req, workspace_id);
    if (access instanceof Response) return access;
    const guard = requireRole(access, WorkspaceRole.Manager);
    if (guard instanceof Response) return guard;

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

    const service = new CalendarManagementService(db);
    await service.softDelete(calendar_id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-calendars-delete error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
