import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { ConversationService } from '../../src/lib/conversations/service';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

/**
 * Fetch messages + recent events for a debug conversation. Used by the
 * debug-chat UI's poll loop.
 *
 * GET /.netlify/functions/api-debug-conversation-messages?conversation_id=...&since=<iso>
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const url = new URL(req.url);
    const conversationId = url.searchParams.get('conversation_id');
    const since = url.searchParams.get('since');

    if (!conversationId) {
      return new Response(JSON.stringify({ error: 'conversation_id is required' }), { status: 400 });
    }

    const conversationService = new ConversationService(db);
    const conversation = await conversationService.getById(conversationId);
    if (!conversation || !conversation.is_test) {
      return new Response(JSON.stringify({ error: 'Debug conversation not found' }), { status: 404 });
    }

    const access = await requireWorkspaceAccess(req, conversation.workspace_id);
    if (access instanceof Response) return access;

    let messagesQuery = db
      .from('messages')
      .select('id, conversation_id, direction, sender_type, body_text, provider_status, sent_at, received_at, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (since) {
      messagesQuery = messagesQuery.gt('created_at', since);
    }

    let eventsQuery = db
      .from('conversation_events')
      .select('id, event_type, event_payload_json, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (since) {
      eventsQuery = eventsQuery.gt('created_at', since);
    }

    const [messagesResult, eventsResult, decisionResult] = await Promise.all([
      messagesQuery,
      eventsQuery,
      db
        .from('ai_decisions')
        .select('id, model_name, decision_json, created_at, message_id')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    if (messagesResult.error) throw new Error(`messages: ${messagesResult.error.message}`);
    if (eventsResult.error) throw new Error(`events: ${eventsResult.error.message}`);

    return new Response(
      JSON.stringify({
        conversation: {
          id: conversation.id,
          status: conversation.status,
          outcome: conversation.outcome,
          human_controlled: conversation.human_controlled,
          last_activity_at: conversation.last_activity_at,
        },
        messages: messagesResult.data ?? [],
        events: eventsResult.data ?? [],
        recent_decisions: decisionResult.data ?? [],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    console.error('api-debug-conversation-messages error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500 },
    );
  }
};
