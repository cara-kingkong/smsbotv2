import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { ConversationService } from '../../src/lib/conversations/service';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';
import { requireRole } from '../../src/lib/auth/permissions';
import { WorkspaceRole } from '../../src/lib/types';

/**
 * Release a conversation back to AI control.
 * POST /.netlify/functions/api-inbox-release
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
    const guard = requireRole(access, WorkspaceRole.Manager);
    if (guard instanceof Response) return guard;

    if (!conversation.human_controlled) {
      return new Response(
        JSON.stringify({ error: 'Conversation is not currently human-controlled' }),
        { status: 409 },
      );
    }

    // Release back to AI into LISTENING MODE only. We deliberately do NOT enqueue
    // an AI reply here — handing the thread back shouldn't fire an unprompted
    // message. The AI resumes naturally on the lead's next inbound (see
    // webhook-twilio-inbound), or immediately if an operator hits "Generate AI
    // reply" (api-inbox-generate-reply).
    const updated = await conversationService.releaseToAI(conversation_id);

    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-inbox-release error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
