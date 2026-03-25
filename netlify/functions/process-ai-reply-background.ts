import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { ConversationService } from '../../src/lib/conversations/service';
import { MessagingService } from '../../src/lib/messaging/service';
import { AIService } from '../../src/lib/ai/service';
import { AgentService } from '../../src/lib/agents/service';
import { LeadService } from '../../src/lib/leads/service';
import { CampaignService } from '../../src/lib/campaigns/service';
import { BookingService } from '../../src/lib/calendar/service';
import { QueueService } from '../../src/lib/queues/service';
import { TwilioAdapter } from '../../src/lib/messaging/adapters/twilio';
import { OpenAIAdapter } from '../../src/lib/ai/adapters/openai';
import { AnthropicAdapter } from '../../src/lib/ai/adapters/anthropic';
import { ConversationStatus, ConversationOutcome, SenderType, CRMEventType, MessageDirection } from '../../src/lib/types';
import { CRMService } from '../../src/lib/crm/service';
import type { AIProviderAdapter } from '../../src/lib/types';
import { isWithinBusinessHours, getNextBusinessHoursStart } from '../../src/lib/utils/business-hours';
import { evaluateStopConditions } from '../../src/lib/utils/stop-conditions';

/**
 * Background function: Generate AI reply and send SMS.
 * Enforces business hours, stop conditions, and persists AI decisions.
 */
export default async (req: Request, _context: Context) => {
  const db = getServiceClient();

  try {
    const { conversation_id, trigger } = await req.json() as {
      conversation_id: string;
      trigger?: string;
    };

    // ── Follow-up guard: skip if lead has replied since scheduling ──
    if (trigger === 'followup_scheduled') {
      const { data: latestMsg } = await db
        .from('messages')
        .select('direction')
        .eq('conversation_id', conversation_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (latestMsg?.direction === MessageDirection.Inbound) {
        console.log(`Follow-up skipped for ${conversation_id}: lead already replied`);
        return new Response('Skipped — lead replied', { status: 200 });
      }
    }

    const conversationService = new ConversationService(db);
    const conversation = await conversationService.getById(conversation_id);

    if (!conversation) {
      console.error(`Conversation not found: ${conversation_id}`);
      return new Response('Not found', { status: 404 });
    }

    // Skip if human-controlled or terminal
    if (
      conversation.human_controlled ||
      conversation.status === ConversationStatus.Completed ||
      conversation.status === ConversationStatus.OptedOut ||
      conversation.status === ConversationStatus.Failed
    ) {
      return new Response('Skipped', { status: 200 });
    }

    // Load dependencies
    const agentService = new AgentService(db);
    const leadService = new LeadService(db);
    const campaignService = new CampaignService(db);
    const twilioAdapter = new TwilioAdapter(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
    const messagingService = new MessagingService(db, twilioAdapter);

    const version = await agentService.getActiveVersion(conversation.agent_id);
    if (!version) throw new Error(`No active version for agent ${conversation.agent_id}`);

    const lead = await leadService.getById(conversation.lead_id);
    if (!lead) throw new Error(`Lead not found: ${conversation.lead_id}`);

    const campaign = await campaignService.getById(conversation.campaign_id);
    if (!campaign) throw new Error(`Campaign not found: ${conversation.campaign_id}`);

    // ── Stop conditions check ──────────────────────────────────
    const stopResult = await evaluateStopConditions(db, conversation, campaign.stop_conditions_json);
    if (stopResult.should_stop) {
      console.log(`Conversation ${conversation_id} stopped: ${stopResult.reason}`);
      await conversationService.setOutcome(conversation_id, ConversationOutcome.NoResponse);
      await conversationService.updateStatus(conversation_id, ConversationStatus.Completed);
      await db.from('conversation_events').insert({
        conversation_id,
        event_type: 'stop_condition_reached',
        event_payload_json: { reason: stopResult.reason },
      });
      return new Response('Stopped', { status: 200 });
    }

    // ── Business hours check ───────────────────────────────────
    const hasBusinessHours = campaign.business_hours_json?.schedule?.length > 0;
    if (hasBusinessHours && !isWithinBusinessHours(campaign.business_hours_json, lead.timezone)) {
      const nextOpen = getNextBusinessHoursStart(campaign.business_hours_json, lead.timezone);
      if (nextOpen) {
        // Re-queue for next business hours window
        const queueService = new QueueService(db);
        await queueService.enqueue({
          job_type: 'generate_ai_reply',
          queue_name: 'ai',
          payload: { conversation_id, trigger: 'business_hours_deferred' },
          run_at: nextOpen,
        });
        await conversationService.updateStatus(conversation_id, ConversationStatus.PausedBusinessHours);
        console.log(`Conversation ${conversation_id} deferred to business hours: ${nextOpen.toISOString()}`);
        return new Response('Deferred', { status: 200 });
      }
    }

    // Get message history
    const history = await messagingService.getHistory(conversation_id);

    // Determine AI provider
    const aiAdapters = new Map<string, AIProviderAdapter>();
    if (process.env.OPENAI_API_KEY) aiAdapters.set('openai', new OpenAIAdapter(process.env.OPENAI_API_KEY));
    if (process.env.ANTHROPIC_API_KEY) aiAdapters.set('anthropic', new AnthropicAdapter(process.env.ANTHROPIC_API_KEY));

    const aiService = new AIService(db, aiAdapters);

    // Get calendars for agent
    const bookingService = new BookingService(db, null as never);
    const calendars = await bookingService.getCalendarsForAgent(conversation.agent_id);

    // Resolve AI provider from integration, fallback to default
    let providerKey = 'openai';
    if (version.config_json && typeof version.config_json === 'object' && 'provider' in version.config_json) {
      providerKey = version.config_json.provider as string;
    }
    if (!aiAdapters.has(providerKey)) {
      providerKey = aiAdapters.keys().next().value ?? 'openai';
    }

    // Generate AI decision
    const decision = await aiService.generateReply({
      agent_version: version,
      conversation_history: history,
      lead,
      available_calendar_ids: calendars.map((c) => c.id),
      provider_key: providerKey,
    });

    // ── Persist AI decision to ai_decisions table ──────────────
    await db.from('ai_decisions').insert({
      workspace_id: conversation.workspace_id,
      conversation_id,
      agent_version_id: version.id,
      model_name: providerKey === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o',
      input_json: {
        history_length: history.length,
        lead_timezone: lead.timezone,
        available_calendars: calendars.length,
      },
      decision_json: decision,
      raw_response_json: decision,
    });

    // Log AI decision event
    await db.from('conversation_events').insert({
      conversation_id,
      event_type: 'ai_reply_generated',
      event_payload_json: {
        should_reply: decision.should_reply,
        qualification_state: decision.qualification_state,
        escalate_to_human: decision.escalate_to_human,
        should_book: decision.should_book,
      },
    });

    // Handle escalation
    if (decision.escalate_to_human) {
      await conversationService.updateStatus(conversation_id, ConversationStatus.NeedsHuman);
      return new Response('Escalated', { status: 200 });
    }

    // Send reply if AI says to
    if (decision.should_reply && decision.reply_text) {
      const message = await messagingService.sendOutbound({
        conversation_id,
        to: lead.phone_e164,
        from: process.env.TWILIO_PHONE_NUMBER!,
        body_text: decision.reply_text,
        sender_type: SenderType.AI,
      });

      // Link message to AI decision
      await db.from('ai_decisions')
        .update({ message_id: message.id })
        .eq('conversation_id', conversation_id)
        .is('message_id', null)
        .order('created_at', { ascending: false })
        .limit(1);

      await conversationService.updateStatus(conversation_id, ConversationStatus.WaitingForLead);

      // ── Schedule follow-up if under max_followups limit ─────────
      const cadence = version.reply_cadence_json;
      if (cadence && cadence.max_followups > 0 && cadence.followup_delay_seconds > 0) {
        const { count: followupCount } = await db
          .from('conversation_events')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conversation_id)
          .eq('event_type', 'ai_reply_generated');

        if ((followupCount ?? 0) < cadence.max_followups) {
          const followupRunAt = new Date(Date.now() + cadence.followup_delay_seconds * 1000);
          const queueService = new QueueService(db);
          await queueService.enqueue({
            job_type: 'generate_ai_reply',
            queue_name: 'ai',
            payload: { conversation_id, trigger: 'followup_scheduled' },
            run_at: followupRunAt,
            max_attempts: 1,
          });
          console.log(
            `Follow-up ${(followupCount ?? 0) + 1}/${cadence.max_followups} scheduled for ${conversation_id} at ${followupRunAt.toISOString()}`
          );
        }
      }
    }

    // Handle booking recommendation
    if (decision.should_book && decision.recommended_calendar_id) {
      const queueService = new QueueService(db);
      await queueService.enqueue({
        job_type: 'process_booking',
        queue_name: 'booking',
        payload: {
          conversation_id,
          recommended_calendar_id: decision.recommended_calendar_id,
          lead_id: lead.id,
          agent_id: conversation.agent_id,
        },
      });
    }

    // Emit CRM events for qualification state changes and escalation
    const crmEventType =
      decision.qualification_state === 'qualified'
        ? CRMEventType.ConversationQualified
        : decision.qualification_state === 'unqualified'
          ? CRMEventType.ConversationUnqualified
          : decision.escalate_to_human
            ? CRMEventType.ConversationNeedsHuman
            : null;

    if (crmEventType && lead.external_contact_id) {
      const { data: crmIntegration } = await db
        .from('integrations')
        .select('id, provider')
        .eq('workspace_id', conversation.workspace_id)
        .eq('type', 'crm')
        .eq('status', 'active')
        .limit(1)
        .single();

      if (crmIntegration) {
        const crmService = new CRMService(db, new Map());
        const noteMap: Record<string, string> = {
          [CRMEventType.ConversationQualified]: 'Lead qualified via SMS chatbot',
          [CRMEventType.ConversationUnqualified]: 'Lead unqualified via SMS chatbot',
          [CRMEventType.ConversationNeedsHuman]: 'Lead escalated to human via SMS chatbot',
        };

        const crmEvent = await crmService.emitEvent({
          workspace_id: conversation.workspace_id,
          conversation_id,
          integration_id: crmIntegration.id,
          event_type: crmEventType,
          external_contact_id: lead.external_contact_id,
          payload: {
            external_contact_id: lead.external_contact_id,
            tag_name: crmEventType.replace('conversation_', ''),
            note_body: noteMap[crmEventType],
          },
        });

        const crmQueueService = new QueueService(db);
        await crmQueueService.enqueue({
          job_type: 'process_crm_sync',
          queue_name: 'crm',
          payload: { crm_event_id: crmEvent.id, provider: crmIntegration.provider },
        });
      }
    }

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('process-ai-reply-background error:', err);
    return new Response('Error', { status: 500 });
  }
};
