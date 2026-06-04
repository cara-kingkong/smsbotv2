import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { ConversationService } from '../../src/lib/conversations/service';
import { QueueService } from '../../src/lib/queues/service';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';
import { requireRole } from '../../src/lib/auth/permissions';
import {
  ConversationStatus,
  MessageDirection,
  SenderType,
  WorkspaceRole,
} from '../../src/lib/types';
import { nanoid } from 'nanoid';

interface SendDebugBody {
  conversation_id: string;
  body_text: string;
}

/**
 * Send an inbound "lead" message into a debug conversation and trigger the AI
 * to reply. Mirrors webhook-twilio-inbound for test threads (no Twilio).
 *
 * POST /.netlify/functions/api-debug-conversation-send
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const body = (await req.json()) as SendDebugBody;

    if (!body.conversation_id || !body.body_text?.trim()) {
      return new Response(
        JSON.stringify({ error: 'conversation_id and body_text are required' }),
        { status: 400 },
      );
    }

    const conversationService = new ConversationService(db);
    const conversation = await conversationService.getById(body.conversation_id);
    if (!conversation) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), { status: 404 });
    }

    if (!conversation.is_test) {
      return new Response(
        JSON.stringify({ error: 'Endpoint only accepts debug (is_test) conversations' }),
        { status: 400 },
      );
    }

    const access = await requireWorkspaceAccess(req, conversation.workspace_id);
    if (access instanceof Response) return access;
    const guard = requireRole(access, WorkspaceRole.Manager);
    if (guard instanceof Response) return guard;

    const terminalStatuses = [
      ConversationStatus.Completed,
      ConversationStatus.OptedOut,
      ConversationStatus.Failed,
    ];
    if (terminalStatuses.includes(conversation.status as ConversationStatus)) {
      return new Response(
        JSON.stringify({ error: `Conversation is terminal (${conversation.status})` }),
        { status: 409 },
      );
    }

    // Persist the inbound "lead" message directly (no Twilio webhook receipt).
    const { data: message, error: insertError } = await db
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        direction: MessageDirection.Inbound,
        sender_type: SenderType.Lead,
        body_text: body.body_text,
        provider_message_id: `debug_${nanoid(16)}`,
        provider_status: 'debug',
        received_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) throw new Error(`Failed to insert debug message: ${insertError.message}`);

    // Keep the conversation active.
    await conversationService.updateStatus(
      conversation.id,
      conversation.human_controlled ? ConversationStatus.HumanControlled : ConversationStatus.Active,
    );

    // Trigger an AI reply unless a human is driving. Debug mode skips the
    // reply-delay coalesce window — we want immediate feedback.
    if (!conversation.human_controlled) {
      const queueService = new QueueService(db);
      await queueService.cancelPendingAIReplies(conversation.id);
      await queueService.enqueue({
        workspace_id: conversation.workspace_id,
        job_type: 'generate_ai_reply',
        queue_name: 'ai',
        payload: {
          conversation_id: conversation.id,
          trigger: 'debug_inbound',
        },
      });
    }

    return new Response(JSON.stringify({ message_id: message.id }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-debug-conversation-send error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500 },
    );
  }
};
