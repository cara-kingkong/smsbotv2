import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { ConversationService } from '../../src/lib/conversations/service';
import { QueueService } from '../../src/lib/queues/service';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';
import { requireRole } from '../../src/lib/auth/permissions';
import { ConversationStatus, ConversationEventType, WorkspaceRole } from '../../src/lib/types';

/**
 * Manually trigger the AI to generate (and send) the next reply on demand.
 * Used from the inbox when a thread is in listening mode, or to ask the AI to
 * take a turn while a human has the thread. Enqueues a `manual_generate` AI
 * reply job, which the background handler runs even when human_controlled is set
 * (see process-ai-reply-background).
 *
 * POST /.netlify/functions/api-inbox-generate-reply
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

    // Can't ask the AI to reply on a finished thread.
    const terminalStatuses = [
      ConversationStatus.Completed,
      ConversationStatus.OptedOut,
      ConversationStatus.Failed,
    ];
    if (terminalStatuses.includes(conversation.status as ConversationStatus)) {
      return new Response(
        JSON.stringify({ error: `Cannot generate a reply for a conversation with status: ${conversation.status}` }),
        { status: 409 },
      );
    }

    const queueService = new QueueService(db);

    // Collapse any already-pending AI reply so the manual trigger doesn't race
    // a debounced inbound job into a double-send.
    await queueService.cancelPendingAIReplies(conversation_id);

    // Cancelling pending jobs can't stop a worker that has already started. If an
    // AI reply is mid-flight, that turn is already covered — enqueuing a manual
    // one would send a second outbound for the same turn. Bail with a conflict so
    // the operator can retry once it lands.
    if (await queueService.hasRunningAIReply(conversation_id)) {
      return new Response(
        JSON.stringify({ error: 'An AI reply is already being generated for this conversation. Try again in a moment.' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      );
    }

    await db.from('conversation_events').insert({
      conversation_id,
      event_type: ConversationEventType.ManualReplyTriggered,
      event_payload_json: { triggered_by: 'inbox', human_controlled: conversation.human_controlled },
    });

    await queueService.enqueue({
      workspace_id: conversation.workspace_id,
      job_type: 'generate_ai_reply',
      queue_name: 'ai',
      payload: {
        conversation_id,
        trigger: 'manual_generate',
      },
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-inbox-generate-reply error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
