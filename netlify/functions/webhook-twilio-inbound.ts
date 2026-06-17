import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { TwilioAdapter } from '../../src/lib/messaging/adapters/twilio';
import { MessagingService } from '../../src/lib/messaging/service';
import { PhoneNumberService } from '../../src/lib/messaging/phone-numbers';
import { QueueService } from '../../src/lib/queues/service';
import { ConversationStatus, ConversationOutcome, ConversationEventType } from '../../src/lib/types';
import { ConversationService } from '../../src/lib/conversations/service';
import { recordOptOut } from '../../src/lib/conversations/opt-out';
import { isOptOut } from '../../src/lib/utils/opt-out';

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

    // Reconstruct the public URL for Twilio signature validation.
    // Behind proxies (Cloudflare tunnel, Netlify Dev) req.url is the local
    // address, but Twilio computed the signature using the public URL.
    const publicUrl = resolvePublicUrl(req);

    const isValid = twilioAdapter.validateWebhookSignature(publicUrl, req.headers, body);
    if (!isValid) {
      console.warn('Invalid Twilio webhook signature. Tried URL:', publicUrl);
      return new Response('Unauthorized', { status: 401 });
    }

    const inbound = twilioAdapter.parseInboundWebhook(body);

    // Pin the workspace via the receiving number so the same lead phone
    // can exist safely across workspaces. Falls back to a global lead
    // lookup when the `To` number hasn't been registered yet — preserves
    // legacy behaviour during migration.
    const phoneNumbers = new PhoneNumberService(db);
    const receivingNumber = inbound.to
      ? await phoneNumbers.findByE164(inbound.to)
      : null;

    let leadQuery = db
      .from('leads')
      .select('id, workspace_id, external_contact_id')
      .eq('phone_e164', inbound.from);

    if (receivingNumber) {
      leadQuery = leadQuery.eq('workspace_id', receivingNumber.workspace_id);
    }

    const { data: lead } = await leadQuery.limit(1).single();

    if (!lead) {
      console.warn(
        `No lead found for phone ${inbound.from}` +
          (receivingNumber ? ` in workspace ${receivingNumber.workspace_id}` : ' (no To-number workspace pinning)'),
      );
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
    const { data: activeConversation } = await db
      .from('conversations')
      .select('id, status, human_controlled, agent_version_id, campaign_id')
      .eq('lead_id', lead.id)
      .is('deleted_at', null)
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

    let conversation = activeConversation;
    console.log(`[Inbound] Lead ${lead.id} — active conversation: ${activeConversation?.id ?? 'none'}`);

    // Track whether this inbound landed on a conversation that had already
    // closed (no active thread, so we fell into the re-open branch below), and
    // whether that closed conversation was already booked. Both drive the
    // team notification + booked-lead routing handled after we record the
    // message.
    let reopenedFromClosed = false;
    let reopenWasBooked = false;
    let reopenPreviousStatus: string | null = null;
    let reopenPreviousOutcome: string | null = null;

    // If no active conversation, re-open the most recent one (except opted-out)
    if (!conversation) {
      // Debug: check what conversations exist for this lead
      const { data: allConversations } = await db
        .from('conversations')
        .select('id, status, outcome, deleted_at')
        .eq('lead_id', lead.id)
        .order('last_activity_at', { ascending: false })
        .limit(5);

      console.log(`[Inbound] All conversations for lead ${lead.id}:`, allConversations);

      const { data: previousConversation } = await db
        .from('conversations')
        .select('id, status, outcome, human_controlled, agent_version_id, campaign_id')
        .eq('lead_id', lead.id)
        .neq('status', ConversationStatus.OptedOut)
        .is('deleted_at', null)
        .order('last_activity_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log(`[Inbound] Re-open candidate:`, previousConversation);

      if (previousConversation) {
        reopenedFromClosed = true;
        reopenPreviousStatus = previousConversation.status;
        reopenPreviousOutcome = previousConversation.outcome ?? null;
        reopenWasBooked = previousConversation.outcome === ConversationOutcome.Booked;

        if (reopenWasBooked) {
          // The lead already has a confirmed booking. Do NOT silently re-open
          // the thread back into the AI flow — re-running booking would offer
          // times again and can cancel/rebook their existing slot (see
          // process-booking-background). Keep the conversation reference so we
          // still honour opt-out and record the message, but route to a human
          // (handled after recordInbound) instead of the AI.
          console.log(`[Inbound] Message on BOOKED conversation ${previousConversation.id} — routing to human, not re-opening for AI`);
          conversation = { ...previousConversation, human_controlled: false };
        } else {
          console.log(`[Inbound] Re-opening conversation ${previousConversation.id} (was ${previousConversation.status}) for lead ${lead.id}`);
          await conversationService.updateStatus(previousConversation.id, ConversationStatus.Active);
          conversation = { ...previousConversation, status: ConversationStatus.Active, human_controlled: false };
        }
      }
    }

    if (!conversation) {
      console.warn(`[Inbound] No conversation found for lead: ${lead.id}`);
      if (receiptId) {
        await db.from('webhook_receipts').update({ processed_status: 'completed' }).eq('id', receiptId);
      }
      return new Response('<Response></Response>', {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    // Check for opt-out keywords (TCPA compliance: STOP is required, others
    // optional). Honours keywords even when the lead adds context, e.g.
    // "Unsubscribe - sold business". "cancel" is excluded — leads use it to
    // cancel bookings, not to opt out. See isOptOut for the matching rules.
    if (isOptOut(inbound.body)) {
      await recordOptOut(db, new QueueService(db), {
        conversationId: conversation.id,
        campaignId: conversation.campaign_id,
        workspaceId: lead.workspace_id,
        leadId: lead.id,
        externalContactId: lead.external_contact_id,
      });

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

    // A message landed on a conversation that had already closed (we only get
    // here via the re-open branch above). Notify the team out-of-band, and for
    // an already-booked lead route to a human instead of the AI — re-running
    // the booking flow would re-offer times and can cancel their confirmed slot.
    if (reopenedFromClosed) {
      const reopenQueue = new QueueService(db);
      await db.from('conversation_events').insert({
        conversation_id: conversation.id,
        event_type: reopenWasBooked
          ? ConversationEventType.MessageAfterBooking
          : ConversationEventType.ReopenedClosedConversation,
        event_payload_json: {
          previous_status: reopenPreviousStatus,
          previous_outcome: reopenPreviousOutcome,
        },
      });
      await reopenQueue.enqueue({
        workspace_id: lead.workspace_id,
        job_type: 'notify_escalation',
        queue_name: 'default',
        payload: {
          conversation_id: conversation.id,
          reason: reopenWasBooked ? 'message_after_booking' : 'reopened_closed_conversation',
          should_book: false,
          qualification_state: null,
        },
      });

      if (reopenWasBooked) {
        await conversationService.updateStatus(conversation.id, ConversationStatus.NeedsHuman);
        if (receiptId) {
          await db.from('webhook_receipts').update({ processed_status: 'completed' }).eq('id', receiptId);
        }
        return new Response('<Response></Response>', {
          status: 200,
          headers: { 'Content-Type': 'text/xml' },
        });
      }
    }

    // Keep the conversation status aligned with who owns the thread.
    await conversationService.updateStatus(
      conversation.id,
      conversation.human_controlled ? ConversationStatus.HumanControlled : ConversationStatus.Active,
    );

    // If not human-controlled, queue AI evaluation with message coalescing.
    // When a lead sends rapid-fire messages ("Hey" → "Are you there?" → "I need help"),
    // each new message cancels the pending AI reply job and resets the timer.
    // The AI only generates a single reply once the lead stops typing.
    if (!conversation.human_controlled) {
      const queueService = new QueueService(db);

      // Look up the agent version's cadence settings
      let replyDelaySec = 30;
      if (conversation.agent_version_id) {
        const { data: agentVersion } = await db
          .from('agent_versions')
          .select('reply_cadence_json')
          .eq('id', conversation.agent_version_id)
          .single();

        const cadence = agentVersion?.reply_cadence_json;
        if (cadence?.reply_delay_seconds !== undefined && cadence.reply_delay_seconds >= 0) {
          replyDelaySec = cadence.reply_delay_seconds;
        } else if (cadence?.initial_delay_seconds !== undefined || cadence?.coalesce_window_seconds !== undefined) {
          // Legacy fallback: sum the old two-field format
          replyDelaySec = (Number(cadence.coalesce_window_seconds) || 0) + (Number(cadence.initial_delay_seconds) || 0);
        }
      }

      // Cancel any pending AI reply job for this conversation (debounce reset).
      // Each inbound message restarts the reply delay timer.
      const cancelled = await queueService.cancelPendingAIReplies(conversation.id);
      if (cancelled > 0) {
        console.log(`Coalesced: cancelled ${cancelled} pending AI reply job(s) for ${conversation.id}`);
      }

      const runAt = replyDelaySec > 0 ? new Date(Date.now() + replyDelaySec * 1000) : undefined;

      await queueService.enqueue({
        workspace_id: lead.workspace_id,
        job_type: 'generate_ai_reply',
        queue_name: 'ai',
        payload: {
          conversation_id: conversation.id,
          trigger: 'inbound_message',
        },
        ...(runAt ? { run_at: runAt } : {}),
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

/**
 * Reconstruct the public-facing URL that Twilio used to send the request.
 * Proxies (Cloudflare tunnel, Netlify Dev) rewrite req.url to the local
 * address, but Twilio's signature was computed against the original URL.
 */
function resolvePublicUrl(req: Request): string {
  const url = new URL(req.url);
  const forwardedHost = req.headers.get('x-forwarded-host') || url.host;
  const forwardedProto = req.headers.get('x-forwarded-proto') || url.protocol.replace(':', '');

  return `${forwardedProto}://${forwardedHost}${url.pathname}${url.search}`;
}
