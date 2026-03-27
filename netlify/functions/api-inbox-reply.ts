import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { ConversationService } from '../../src/lib/conversations/service';
import { MessagingService } from '../../src/lib/messaging/service';
import { LeadService } from '../../src/lib/leads/service';
import { TwilioAdapter } from '../../src/lib/messaging/adapters/twilio';
import { ConversationStatus, SenderType, ConversationEventType } from '../../src/lib/types';
import { sendManualMessageSchema } from '../../src/lib/utils/validation';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

/**
 * Send a manual human reply in a conversation.
 * POST /.netlify/functions/api-inbox-reply
 * Body: { conversation_id: string, body_text: string }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const body = await req.json();

    // Validate input
    const parsed = sendManualMessageSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Validation failed', details: parsed.error.flatten() }),
        { status: 400 },
      );
    }

    const { conversation_id, body_text } = parsed.data;

    const conversationService = new ConversationService(db);
    const conversation = await conversationService.getById(conversation_id);

    if (!conversation) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), { status: 404 });
    }

    const access = await requireWorkspaceAccess(req, conversation.workspace_id);
    if (access instanceof Response) return access;

    // Prevent replies on terminal conversations
    const terminalStatuses = [
      ConversationStatus.Completed,
      ConversationStatus.OptedOut,
      ConversationStatus.Failed,
    ];

    if (terminalStatuses.includes(conversation.status as ConversationStatus)) {
      return new Response(
        JSON.stringify({ error: `Cannot reply to a conversation with status: ${conversation.status}` }),
        { status: 409 },
      );
    }

    // Auto-takeover if not already human-controlled
    if (!conversation.human_controlled) {
      await conversationService.humanTakeover(conversation_id);
    }

    // Get lead phone for sending
    const leadService = new LeadService(db);
    const lead = await leadService.getById(conversation.lead_id);

    if (!lead) {
      return new Response(JSON.stringify({ error: 'Lead not found for conversation' }), { status: 404 });
    }

    // Send the message via Twilio
    const twilioAdapter = new TwilioAdapter(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!,
    );
    const messagingService = new MessagingService(db, twilioAdapter);

    const message = await messagingService.sendOutbound({
      conversation_id,
      to: lead.phone_e164,
      from: process.env.TWILIO_PHONE_NUMBER!,
      body_text,
      sender_type: SenderType.Human,
    });

    // Log conversation event
    await db.from('conversation_events').insert({
      conversation_id,
      event_type: ConversationEventType.MessageSent,
      event_payload_json: {
        message_id: message.id,
        sender_type: SenderType.Human,
        body_length: body_text.length,
      },
    });

    // Update last activity
    await db
      .from('conversations')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', conversation_id);

    return new Response(JSON.stringify(message), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-inbox-reply error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
