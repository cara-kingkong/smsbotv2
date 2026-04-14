import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

const BOOKING_EVENT_TYPES = ['booking_initiated', 'booking_confirmed', 'booking_failed'];

/**
 * List recent booking activity for a workspace.
 * GET /.netlify/functions/api-calendar-events-list?workspace_id=...&limit=...
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get('workspace_id');
    const access = await requireWorkspaceAccess(req, workspaceId);
    if (access instanceof Response) return access;

    const parsedLimit = Number.parseInt(url.searchParams.get('limit') ?? '50', 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 50;

    const { data: conversations, error: conversationError } = await db
      .from('conversations')
      .select(`
        id,
        status,
        outcome,
        closed_at,
        last_activity_at,
        lead:leads(first_name, last_name, phone_e164)
      `)
      .eq('workspace_id', access.workspace.id)
      .is('deleted_at', null)
      .order('last_activity_at', { ascending: false })
      .limit(150);

    if (conversationError) {
      throw new Error(`Failed to load conversations: ${conversationError.message}`);
    }

    const conversationRows = conversations ?? [];
    const conversationIds = conversationRows.map((row) => row.id);

    if (conversationIds.length === 0) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: events, error: eventError } = await db
      .from('conversation_events')
      .select('id, conversation_id, event_type, event_payload_json, created_at')
      .in('conversation_id', conversationIds)
      .in('event_type', BOOKING_EVENT_TYPES)
      .order('created_at', { ascending: false })
      .limit(limit * 3);

    if (eventError) {
      throw new Error(`Failed to load booking activity: ${eventError.message}`);
    }

    const conversationMap = new Map(conversationRows.map((row) => [row.id, row]));

    const payload = (events ?? [])
      .map((event) => {
        const conversation = conversationMap.get(event.conversation_id);
        if (!conversation) return null;

        return {
          id: event.id,
          conversation_id: event.conversation_id,
          event_type: event.event_type,
          event_payload_json: event.event_payload_json,
          created_at: event.created_at,
          conversation: {
            id: conversation.id,
            status: conversation.status,
            outcome: conversation.outcome,
            closed_at: conversation.closed_at,
          },
          lead: conversation.lead,
        };
      })
      .filter(Boolean)
      .slice(0, limit);

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=10, stale-while-revalidate=30',
      },
    });
  } catch (err) {
    console.error('api-calendar-events-list error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
