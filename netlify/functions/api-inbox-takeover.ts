import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { ConversationService } from '../../src/lib/conversations/service';
import { ConversationStatus } from '../../src/lib/types';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

/**
 * Human takeover of a conversation.
 * POST /.netlify/functions/api-inbox-takeover
 * Body: { conversation_id: string }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const { conversation_id } = (await req.json()) as { conversation_id: string };

    if (!conversation_id) {
      return new Response(JSON.stringify({ error: 'conversation_id is required' }), { status: 400 });
    }

    const conversationService = new ConversationService(db);
    const conversation = await conversationService.getById(conversation_id);

    if (!conversation) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), { status: 404 });
    }

    const access = await requireWorkspaceAccess(req, conversation.workspace_id);
    if (access instanceof Response) return access;

    // Prevent takeover on terminal conversations
    const terminalStatuses = [
      ConversationStatus.Completed,
      ConversationStatus.OptedOut,
      ConversationStatus.Failed,
    ];

    if (terminalStatuses.includes(conversation.status as ConversationStatus)) {
      return new Response(
        JSON.stringify({ error: `Cannot take over a conversation with status: ${conversation.status}` }),
        { status: 409 },
      );
    }

    // Already human-controlled is a no-op success
    if (conversation.human_controlled) {
      return new Response(JSON.stringify(conversation), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const updated = await conversationService.humanTakeover(conversation_id);

    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-inbox-takeover error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
