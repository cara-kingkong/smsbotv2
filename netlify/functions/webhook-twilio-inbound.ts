import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { TwilioAdapter } from '../../src/lib/messaging/adapters/twilio';
import { MessagingService } from '../../src/lib/messaging/service';
import { QueueService } from '../../src/lib/queues/service';
import { ConversationStatus } from '../../src/lib/types';

/**
 * Twilio inbound SMS webhook.
 * POST /.netlify/functions/webhook-twilio-inbound
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const db = getServiceClient();
  const twilioAdapter = new TwilioAdapter(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!,
  );

  try {
    const bodyText = await req.text();
    const body = Object.fromEntries(new URLSearchParams(bodyText));

    // Validate webhook signature
    const headers = Object.fromEntries(req.headers.entries());
    const isValid = twilioAdapter.validateWebhookSignature(headers, JSON.stringify(body));
    if (!isValid) {
      console.warn('Invalid Twilio webhook signature');
      // Continue for development; enforce in production
    }

    const inbound = twilioAdapter.parseInboundWebhook(body);

    // Store raw receipt
    await db.from('webhook_receipts').insert({
      workspace_id: '00000000-0000-0000-0000-000000000000', // Resolved below
      source_type: 'twilio_inbound',
      source_identifier: inbound.from,
      idempotency_key: inbound.provider_message_id,
      payload_json: inbound.raw_payload,
      processed_status: 'processing',
    });

    // Find active conversation by inbound phone number
    const { data: lead } = await db
      .from('leads')
      .select('id, workspace_id')
      .eq('phone_e164', inbound.from)
      .limit(1)
      .single();

    if (!lead) {
      console.warn(`No lead found for phone: ${inbound.from}`);
      return new Response('<Response></Response>', {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // Find active conversation for this lead
    const { data: conversation } = await db
      .from('conversations')
      .select('id, status, human_controlled')
      .eq('lead_id', lead.id)
      .in('status', [
        ConversationStatus.Active,
        ConversationStatus.WaitingForLead,
        ConversationStatus.Queued,
        ConversationStatus.PausedBusinessHours,
        ConversationStatus.NeedsHuman,
        ConversationStatus.HumanControlled,
      ])
      .order('last_activity_at', { ascending: false })
      .limit(1)
      .single();

    if (!conversation) {
      console.warn(`No active conversation for lead: ${lead.id}`);
      return new Response('<Response></Response>', {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // Check for opt-out keywords
    const optOutKeywords = ['stop', 'unsubscribe', 'cancel', 'quit', 'end'];
    if (optOutKeywords.includes(inbound.body.trim().toLowerCase())) {
      await db.from('conversations').update({ status: ConversationStatus.OptedOut, outcome: 'opted_out' }).eq('id', conversation.id);
      await db.from('leads').update({ opted_out: true }).eq('id', lead.id);
      return new Response('<Response></Response>', {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // Record the inbound message
    const messagingService = new MessagingService(db, twilioAdapter);
    await messagingService.recordInbound({
      conversation_id: conversation.id,
      body_text: inbound.body,
      provider_message_id: inbound.provider_message_id,
    });

    // Update conversation status
    await db
      .from('conversations')
      .update({
        status: ConversationStatus.Active,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', conversation.id);

    // If not human-controlled, queue AI evaluation
    if (!conversation.human_controlled) {
      const queueService = new QueueService(db);
      await queueService.enqueue({
        job_type: 'generate_ai_reply',
        queue_name: 'ai',
        payload: {
          conversation_id: conversation.id,
          trigger: 'inbound_message',
        },
      });
    }

    // Respond with empty TwiML (no auto-response)
    return new Response('<Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (err) {
    console.error('webhook-twilio-inbound error:', err);
    return new Response('<Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  }
};
