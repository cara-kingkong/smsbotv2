import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { CalendarManagementService } from '../../src/lib/calendar/management';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

/**
 * Fetch available Calendly event types for a connected integration.
 * GET /.netlify/functions/api-calendars-event-types?workspace_id=...&integration_id=...&search=...&include_inactive=true
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get('workspace_id');
    const integrationId = url.searchParams.get('integration_id');

    if (!integrationId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: integration_id' }),
        { status: 400 },
      );
    }

    const access = await requireWorkspaceAccess(req, workspaceId);
    if (access instanceof Response) return access;

    // Verify integration belongs to this workspace
    const { data: integration, error: intError } = await db
      .from('integrations')
      .select('id')
      .eq('id', integrationId)
      .eq('workspace_id', access.workspace.id)
      .single();

    if (intError || !integration) {
      return new Response(
        JSON.stringify({ error: 'Integration not found in this workspace' }),
        { status: 404 },
      );
    }

    const search = url.searchParams.get('search') || undefined;
    const includeInactive = url.searchParams.get('include_inactive') === 'true';

    const service = new CalendarManagementService(db);
    const eventTypes = await service.fetchEventTypes(integrationId, { search, includeInactive });

    return new Response(JSON.stringify(eventTypes), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('api-calendars-event-types error:', err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500 },
    );
  }
};
