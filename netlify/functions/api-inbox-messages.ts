import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { ConversationService } from '../../src/lib/conversations/service';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

/**
 * Fetch message history for a conversation.
 * GET /.netlify/functions/api-inbox-messages?conversation_id=...
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const url = new URL(req.url);
    const conversationId = url.searchParams.get('conversation_id');

    if (!conversationId) {
      return new Response(JSON.stringify({ error: 'conversation_id is required' }), { status: 400 });
    }

    const conversationService = new ConversationService(db);
    const conversation = await conversationService.getById(conversationId);
    if (!conversation) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), { status: 404 });
    }

    const access = await requireWorkspaceAccess(req, conversation.workspace_id);
    if (access instanceof Response) return access;

    const { data, error } = await db
      .from('messages')
      .select('id, conversation_id, direction, sender_type, body_text, provider_status, sent_at, received_at, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Failed to fetch messages: ${error.message}`);

    return new Response(JSON.stringify(data ?? []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-inbox-messages error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
