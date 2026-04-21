import type { Context } from '@netlify/functions';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { ConversationService } from '../../src/lib/conversations/service';
import { MessagingService } from '../../src/lib/messaging/service';
import { TwilioAdapter } from '../../src/lib/messaging/adapters/twilio';
import { PhoneNumberService } from '../../src/lib/messaging/phone-numbers';
import { checkSendAllowed } from '../../src/lib/messaging/send-guard';
import { LeadService } from '../../src/lib/leads/service';
import { runQueueJob } from '../../src/lib/queues/job-runner';
import { ConversationStatus, SenderType } from '../../src/lib/types';

interface ProcessSendSmsPayload {
  message_id: string;
  conversation_id: string;
  to: string;
  from?: string;
  job_id?: string;
  worker_id?: string;
  lease_seconds?: number;
}

/**
 * Background function: Send a queued SMS message.
 *
 * Responsibilities:
 *  - Resolve the outbound `from` number from the workspace inventory
 *    when the caller did not pin one (falls back to TWILIO_PHONE_NUMBER).
 *  - Enforce business hours for automated (AI/system) sends — reschedules
 *    the job for the next open window and pauses the conversation.
 *  - Dispatch the message via the provider adapter.
 */
export default async (req: Request, _context: Context) =>
  runQueueJob<ProcessSendSmsPayload>(req, 'process-send-sms-background', async (payload, context) => {
    const conversationService = new ConversationService(context.db);
    const conversation = await conversationService.getById(payload.conversation_id);
    if (!conversation) return new Response('Skipped', { status: 200 });

    const { data: message } = await context.db
      .from('messages')
      .select('id, sender_type, provider_message_id')
      .eq('id', payload.message_id)
      .single();

    if (!message) return new Response('Skipped — message not found', { status: 200 });
    if (message.provider_message_id) return new Response('Already sent', { status: 200 });

    // Business hours guard (human sends bypass).
    const guard = await checkSendAllowed({
      db: context.db,
      queueService: context.queueService,
      conversationId: payload.conversation_id,
      senderType: message.sender_type as SenderType,
      reschedule: {
        jobType: 'process_send_sms',
        queueName: 'sms',
        payload: {
          message_id: payload.message_id,
          conversation_id: payload.conversation_id,
          to: payload.to,
          // `from` is deliberately omitted so it's re-resolved at send time
        },
        workspaceId: conversation.workspace_id,
      },
    });

    if (!guard.allow) {
      return new Response('Deferred — outside business hours', { status: 200 });
    }

    // Resolve outbound `from`. The country MUST match the lead's — we never
    // send into a country the workspace hasn't configured. A caller-pinned
    // `from` is accepted as-is (AI reply path already resolves it upstream).
    let fromNumber = payload.from;
    if (!fromNumber) {
      const phoneNumbers = new PhoneNumberService(context.db);
      const leadService = new LeadService(context.db);
      const lead = await leadService.getById(conversation.lead_id);
      if (lead) {
        const resolved = await phoneNumbers.resolveForLead(conversation.workspace_id, lead.phone_e164);
        if (resolved) {
          fromNumber = resolved.e164;
        } else {
          const leadCountry = parsePhoneNumberFromString(lead.phone_e164)?.country ?? null;
          console.warn(
            `Send blocked for conversation ${payload.conversation_id}: no workspace number in country ${leadCountry ?? 'unknown'}`,
          );
          await context.db.from('conversation_events').insert({
            conversation_id: payload.conversation_id,
            event_type: 'send_blocked_no_number_for_country',
            event_payload_json: {
              workspace_id: conversation.workspace_id,
              lead_phone: lead.phone_e164,
              lead_country: leadCountry,
              message_id: payload.message_id,
            },
          });
          await context.db
            .from('messages')
            .update({
              provider_status: 'blocked_no_number_for_country',
              error_json: { reason: 'no_workspace_number_for_country', lead_country: leadCountry },
            })
            .eq('id', payload.message_id);
          await new ConversationService(context.db).updateStatus(
            payload.conversation_id,
            ConversationStatus.NeedsHuman,
          );
          return new Response('Blocked — no workspace number for lead country', { status: 200 });
        }
      }
    }

    if (!fromNumber) {
      throw new Error(`No outbound phone number resolvable for conversation ${payload.conversation_id}`);
    }

    const twilioAdapter = new TwilioAdapter(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!,
    );
    const messagingService = new MessagingService(context.db, twilioAdapter);

    await context.heartbeat();
    await messagingService.dispatchQueuedOutbound({
      message_id: payload.message_id,
      to: payload.to,
      from: fromNumber,
    });

    return new Response('OK', { status: 200 });
  });
