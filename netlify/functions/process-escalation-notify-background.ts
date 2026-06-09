import type { Context } from '@netlify/functions';
import { ConversationService } from '../../src/lib/conversations/service';
import { LeadService } from '../../src/lib/leads/service';
import { MessagingService } from '../../src/lib/messaging/service';
import { runQueueJob } from '../../src/lib/queues/job-runner';
import { notifyEscalation } from '../../src/lib/utils/escalation-notify';
import { ConversationEventType, MessageDirection } from '../../src/lib/types';

interface ProcessEscalationNotifyPayload {
  conversation_id: string;
  reason: string;
  should_book?: boolean;
  qualification_state?: string | null;
  job_id?: string;
  worker_id?: string;
  lease_seconds?: number;
}

/** How many trailing messages to include in the webhook payload for triage. */
const RECENT_MESSAGE_LIMIT = 12;

/**
 * Background function: POST a "needs human" escalation to the team webhook.
 *
 * Runs on the `default` queue. Throwing marks the job failed so the queue
 * retries (transient webhook/network errors); a missing webhook URL is NOT an
 * error — the conversation is already in the Needs Human inbox.
 */
export default async (req: Request, _context: Context) =>
  runQueueJob<ProcessEscalationNotifyPayload>(req, 'process-escalation-notify-background', async (payload, context) => {
    const { db } = context;
    const { conversation_id, reason, should_book, qualification_state } = payload;

    const conversationService = new ConversationService(db);
    const conversation = await conversationService.getById(conversation_id);
    if (!conversation) {
      console.warn(`Escalation notify skipped — conversation not found: ${conversation_id}`);
      return new Response('Skipped', { status: 200 });
    }

    const leadService = new LeadService(db);
    const messagingService = new MessagingService(db, {} as never);
    const [lead, history] = await Promise.all([
      leadService.getById(conversation.lead_id),
      messagingService.getHistory(conversation_id),
    ]);

    if (!lead) {
      console.warn(`Escalation notify skipped — lead not found: ${conversation.lead_id}`);
      return new Response('Skipped', { status: 200 });
    }

    const leadEngaged = history.some((m) => m.direction === MessageDirection.Inbound);
    const recentMessages = history.slice(-RECENT_MESSAGE_LIMIT).map((m) => ({
      direction: m.direction,
      sender_type: m.sender_type,
      body_text: m.body_text,
      at: m.created_at,
    }));

    const result = await notifyEscalation({
      reason,
      workspace_id: conversation.workspace_id,
      conversation_id,
      lead: { first_name: lead.first_name, last_name: lead.last_name, phone: lead.phone_e164 },
      qualification_state: qualification_state ?? null,
      should_book: should_book ?? false,
      lead_engaged: leadEngaged,
      recent_messages: recentMessages,
      occurred_at: new Date().toISOString(),
    });

    // Record the attempt so the Diagnostics panel shows whether the team was
    // actually notified (vs. only surfaced in the inbox because no URL is set).
    await db.from('conversation_events').insert({
      conversation_id,
      event_type: ConversationEventType.EscalationNotified,
      event_payload_json: { reason, delivered: result.delivered, skipped: result.skipped },
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
