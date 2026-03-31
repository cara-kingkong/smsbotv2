import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { TwilioAdapter } from '../../src/lib/messaging/adapters/twilio';
import { MessagingService } from '../../src/lib/messaging/service';
import { QueueService } from '../../src/lib/queues/service';
import { ConversationOutcome, ConversationStatus, CRMEventType } from '../../src/lib/types';
import { ConversationService } from '../../src/lib/conversations/service';
import { CRMService } from '../../src/lib/crm/service';

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
  let receiptId: string | null = null;
  let receiptWorkspaceId: string | null = null;
  let receiptKey: string | null = null;

  try {
    const bodyText = await req.text();
    const body = Object.fromEntries(new URLSearchParams(bodyText)) as Record<string, string>;

    // Validate webhook signature before touching the database.
    const isValid = twilioAdapter.validateWebhookSignature(req.url, req.headers, body);
    if (!isValid) {
      console.warn('Invalid Twilio webhook signature');
      return new Response('Unauthorized', { status: 401 });
    }

    const inbound = twilioAdapter.parseInboundWebhook(body);

    // Find active conversation by inbound phone number
    const { data: lead } = await db
      .from('leads')
      .select('id, workspace_id, external_contact_id')
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

    receiptWorkspaceId = lead.workspace_id;
    receiptKey = inbound.provider_message_id;

    const { data: receipt, error: receiptError } = await db
      .from('webhook_receipts')
      .insert({
        workspace_id: lead.workspace_id,
        source_type: 'twilio_inbound',
        source_identifier: inbound.from,
        idempotency_key: inbound.provider_message_id,
        payload_json: inbound.raw_payload,
        processed_status: 'processing',
      })
      .select('id')
      .single();

    if (receiptError) {
      if (receiptError.code === '23505' || receiptError.message.includes('duplicate key')) {
        const { data: existingMessage } = await db
          .from('messages')
          .select('id')
          .eq('provider_message_id', inbound.provider_message_id)
          .limit(1)
          .single();

        if (existingMessage) {
          return new Response('<Response></Response>', {
            status: 200,
            headers: { 'Content-Type': 'text/xml' },
          });
        }

        const { data: existingReceipt } = await db
          .from('webhook_receipts')
          .select('processed_status')
          .eq('workspace_id', lead.workspace_id)
          .eq('idempotency_key', inbound.provider_message_id)
          .single();

        if (existingReceipt?.processed_status === 'completed') {
          return new Response('<Response></Response>', {
            status: 200,
            headers: { 'Content-Type': 'text/xml' },
          });
        }

        return new Response('<Response></Response>', {
          status: 500,
          headers: { 'Content-Type': 'text/xml' },
        });
      }
      throw new Error(`Failed to store webhook receipt: ${receiptError.message}`);
    }

    receiptId = receipt?.id ?? null;
    const conversationService = new ConversationService(db);

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
      if (receiptId) {
        await db.from('webhook_receipts').update({ processed_status: 'completed' }).eq('id', receiptId);
      }
      return new Response('<Response></Response>', {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // Check for opt-out keywords
    const optOutKeywords = ['stop', 'unsubscribe', 'cancel', 'quit', 'end'];
    if (optOutKeywords.includes(inbound.body.trim().toLowerCase())) {
      await conversationService.setOutcome(conversation.id, ConversationOutcome.OptedOut);
      await conversationService.updateStatus(conversation.id, ConversationStatus.OptedOut);
      await db.from('leads').update({ opted_out: true }).eq('id', lead.id);

      // Emit CRM event for opt-out
      if (lead.external_contact_id) {
        const { data: crmIntegration } = await db
          .from('integrations')
          .select('id, provider')
          .eq('workspace_id', lead.workspace_id)
          .eq('type', 'crm')
          .eq('status', 'active')
          .limit(1)
          .single();

        if (crmIntegration) {
          const crmService = new CRMService(db, new Map());
          const crmEvent = await crmService.emitEvent({
            workspace_id: lead.workspace_id,
            conversation_id: conversation.id,
            integration_id: crmIntegration.id,
            event_type: CRMEventType.ConversationOptedOut,
            external_contact_id: lead.external_contact_id,
            payload: {
              external_contact_id: lead.external_contact_id,
              tag_name: 'opted_out',
              note_body: 'Lead opted out of SMS chatbot',
            },
          });

          const queueService = new QueueService(db);
          await queueService.enqueue({
            workspace_id: lead.workspace_id,
            job_type: 'process_crm_sync',
            queue_name: 'crm',
            payload: { crm_event_id: crmEvent.id, provider: crmIntegration.provider },
          });
        }
      }

      if (receiptId) {
        await db.from('webhook_receipts').update({ processed_status: 'completed' }).eq('id', receiptId);
      }

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

    // Keep the conversation status aligned with who owns the thread.
    await conversationService.updateStatus(
      conversation.id,
      conversation.human_controlled ? ConversationStatus.HumanControlled : ConversationStatus.Active,
    );

    // If not human-controlled, queue AI evaluation
    if (!conversation.human_controlled) {
      const queueService = new QueueService(db);
      await queueService.enqueue({
        workspace_id: lead.workspace_id,
        job_type: 'generate_ai_reply',
        queue_name: 'ai',
        payload: {
          conversation_id: conversation.id,
          trigger: 'inbound_message',
        },
      });
    }

    if (receiptId) {
      await db.from('webhook_receipts').update({ processed_status: 'completed' }).eq('id', receiptId);
    }

    // Respond with empty TwiML (no auto-response)
    return new Response('<Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (err) {
    console.error('webhook-twilio-inbound error:', err);
    if (receiptId) {
      try {
        await db.from('webhook_receipts').update({ processed_status: 'failed' }).eq('id', receiptId);
      } catch (receiptErr) {
        console.warn('Failed to mark Twilio webhook receipt as failed:', receiptErr);
      }
    } else if (receiptWorkspaceId && receiptKey) {
      try {
        await db
          .from('webhook_receipts')
          .update({ processed_status: 'failed' })
          .eq('workspace_id', receiptWorkspaceId)
          .eq('idempotency_key', receiptKey);
      } catch (receiptErr) {
        console.warn('Failed to mark duplicate Twilio webhook receipt as failed:', receiptErr);
      }
    }
    return new Response('<Response></Response>', {
      status: 500,
      headers: { 'Content-Type': 'text/xml' },
    });
  }
};
