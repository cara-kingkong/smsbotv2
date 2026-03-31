import type { Context } from '@netlify/functions';
import { ConversationService } from '../../src/lib/conversations/service';
import { MessagingService } from '../../src/lib/messaging/service';
import { AIService } from '../../src/lib/ai/service';
import { AgentService } from '../../src/lib/agents/service';
import { LeadService } from '../../src/lib/leads/service';
import { CampaignService } from '../../src/lib/campaigns/service';
import { WorkspaceService } from '../../src/lib/workspaces/service';
import { BookingService } from '../../src/lib/calendar/service';
import { TwilioAdapter } from '../../src/lib/messaging/adapters/twilio';
import { OpenAIAdapter } from '../../src/lib/ai/adapters/openai';
import { AnthropicAdapter } from '../../src/lib/ai/adapters/anthropic';
import {
  ConversationStatus,
  ConversationOutcome,
  SenderType,
  CRMEventType,
  MessageDirection,
  ConversationEventType,
} from '../../src/lib/types';
import { CRMService } from '../../src/lib/crm/service';
import type { AIProviderAdapter } from '../../src/lib/types';
import { isWithinBusinessHours, getNextBusinessHoursStart } from '../../src/lib/utils/business-hours';
import { evaluateStopConditions } from '../../src/lib/utils/stop-conditions';
import { runQueueJob } from '../../src/lib/queues/job-runner';

interface ProcessAIReplyPayload {
  conversation_id: string;
  trigger?: string;
  job_id?: string;
  worker_id?: string;
  lease_seconds?: number;
}

/**
 * Background function: Generate AI reply and send SMS.
 * Enforces business hours, stop conditions, and persists AI decisions.
 */
export default async (req: Request, _context: Context) =>
  runQueueJob<ProcessAIReplyPayload>(req, 'process-ai-reply-background', async (payload, context) => {
    const { db, queueService, heartbeat, jobId } = context;
    const { conversation_id, trigger } = payload;

    // Follow-up guard: skip if lead has replied since scheduling.
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
        return new Response('Skipped - lead replied', { status: 200 });
      }
    }

    const conversationService = new ConversationService(db);
    const conversation = await conversationService.getById(conversation_id);

    if (!conversation) {
      console.warn(`Conversation not found or deleted: ${conversation_id}`);
      return new Response('Skipped', { status: 200 });
    }

    if (
      conversation.human_controlled ||
      conversation.status === ConversationStatus.Completed ||
      conversation.status === ConversationStatus.OptedOut ||
      conversation.status === ConversationStatus.Failed
    ) {
      return new Response('Skipped', { status: 200 });
    }

    const agentService = new AgentService(db);
    const leadService = new LeadService(db);
    const campaignService = new CampaignService(db);
    const twilioAdapter = new TwilioAdapter(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
    const messagingService = new MessagingService(db, twilioAdapter);

    const version = await agentService.getVersionById(conversation.agent_version_id);
    if (!version) throw new Error(`Conversation ${conversation_id} is missing agent version ${conversation.agent_version_id}`);
    if (version.agent_id !== conversation.agent_id) {
      throw new Error(
        `Conversation ${conversation_id} references version ${version.id} that does not belong to agent ${conversation.agent_id}`,
      );
    }

    const lead = await leadService.getById(conversation.lead_id);
    if (!lead) throw new Error(`Lead not found: ${conversation.lead_id}`);

    const campaign = await campaignService.getById(conversation.campaign_id);
    if (!campaign) throw new Error(`Campaign not found: ${conversation.campaign_id}`);

    const workspaceService = new WorkspaceService(db);
    const workspace = await workspaceService.getById(campaign.workspace_id);

    const hasCampaignStopConditions = campaign.stop_conditions_json?.max_messages !== undefined
      && Object.keys(campaign.stop_conditions_json).length > 0;
    const effectiveStopConditions = hasCampaignStopConditions
      ? campaign.stop_conditions_json
      : (workspace?.stop_conditions_json && 'max_messages' in workspace.stop_conditions_json)
        ? workspace.stop_conditions_json as typeof campaign.stop_conditions_json
        : { max_messages: 50, max_days: 14, max_no_reply_hours: 72 };

    const stopResult = await evaluateStopConditions(db, conversation, effectiveStopConditions);
    if (stopResult.should_stop) {
      await conversationService.setOutcome(conversation_id, ConversationOutcome.NoResponse);
      await conversationService.updateStatus(conversation_id, ConversationStatus.Completed);
      await db.from('conversation_events').insert({
        conversation_id,
        event_type: ConversationEventType.StopConditionReached,
        event_payload_json: { reason: stopResult.reason },
      });
      return new Response('Stopped', { status: 200 });
    }

    let effectiveBusinessHours = campaign.business_hours_json;
    const hasCampaignHours = effectiveBusinessHours?.schedule?.length > 0;
    if (!hasCampaignHours && workspace?.business_hours_json && 'schedule' in workspace.business_hours_json) {
      effectiveBusinessHours = workspace.business_hours_json as typeof effectiveBusinessHours;
    }

    const hasBusinessHours = effectiveBusinessHours?.schedule?.length > 0;
    if (hasBusinessHours && !isWithinBusinessHours(effectiveBusinessHours, lead.timezone)) {
      const nextOpen = getNextBusinessHoursStart(effectiveBusinessHours, lead.timezone);
      if (nextOpen) {
        await queueService.enqueue({
          workspace_id: conversation.workspace_id,
          job_type: 'generate_ai_reply',
          queue_name: 'ai',
          payload: { conversation_id, trigger: 'business_hours_deferred' },
          run_at: nextOpen,
        });
        await conversationService.updateStatus(conversation_id, ConversationStatus.PausedBusinessHours);
        return new Response('Deferred', { status: 200 });
      }
    }

    await heartbeat();
    const history = await messagingService.getHistory(conversation_id);

    const aiAdapters = new Map<string, AIProviderAdapter>();
    if (process.env.OPENAI_API_KEY) aiAdapters.set('openai', new OpenAIAdapter(process.env.OPENAI_API_KEY));
    if (process.env.ANTHROPIC_API_KEY) aiAdapters.set('anthropic', new AnthropicAdapter(process.env.ANTHROPIC_API_KEY));

    const aiService = new AIService(db, aiAdapters);
    const bookingService = new BookingService(db, null as never);
    const calendars = await bookingService.getCalendarsForAgent(conversation.agent_id);

    let providerKey = 'openai';
    if (version.config_json && typeof version.config_json === 'object' && 'provider' in version.config_json) {
      providerKey = version.config_json.provider as string;
    }
    if (!aiAdapters.has(providerKey)) {
      providerKey = aiAdapters.keys().next().value ?? 'openai';
    }

    await heartbeat();
    const decision = await aiService.generateReply({
      agent_version: version,
      conversation_history: history,
      lead,
      available_calendar_ids: calendars.map((c) => c.id),
      provider_key: providerKey,
    });

    await db.from('ai_decisions').insert({
      workspace_id: conversation.workspace_id,
      conversation_id,
      agent_version_id: version.id,
      model_name: providerKey === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o',
      input_json: {
        history_length: history.length,
        lead_timezone: lead.timezone,
        available_calendars: calendars.length,
        queue_job_id: jobId ?? null,
      },
      decision_json: decision,
      raw_response_json: decision,
    });

    await db.from('conversation_events').insert({
      conversation_id,
      event_type: ConversationEventType.AIReplyGenerated,
      event_payload_json: {
        should_reply: decision.should_reply,
        qualification_state: decision.qualification_state,
        escalate_to_human: decision.escalate_to_human,
        should_book: decision.should_book,
      },
    });

    if (decision.escalate_to_human) {
      await conversationService.updateStatus(conversation_id, ConversationStatus.NeedsHuman);
      return new Response('Escalated', { status: 200 });
    }

    if (decision.should_reply && decision.reply_text) {
      await heartbeat();
      const message = await messagingService.sendOutbound({
        conversation_id,
        to: lead.phone_e164,
        from: process.env.TWILIO_PHONE_NUMBER!,
        body_text: decision.reply_text,
        sender_type: SenderType.AI,
        source_job_id: jobId,
      });

      await db.from('ai_decisions')
        .update({ message_id: message.id })
        .eq('conversation_id', conversation_id)
        .is('message_id', null)
        .order('created_at', { ascending: false })
        .limit(1);

      await conversationService.updateStatus(conversation_id, ConversationStatus.WaitingForLead);

      const cadence = version.reply_cadence_json;
      if (cadence && cadence.max_followups > 0 && cadence.followup_delay_seconds > 0) {
        const { count: followupCount } = await db
          .from('conversation_events')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conversation_id)
          .eq('event_type', ConversationEventType.AIReplyGenerated);

        if ((followupCount ?? 0) < cadence.max_followups) {
          const followupRunAt = new Date(Date.now() + cadence.followup_delay_seconds * 1000);
          await queueService.enqueue({
            workspace_id: conversation.workspace_id,
            job_type: 'generate_ai_reply',
            queue_name: 'ai',
            payload: { conversation_id, trigger: 'followup_scheduled' },
            run_at: followupRunAt,
            max_attempts: 1,
          });
        }
      }
    }

    if (decision.should_book && decision.recommended_calendar_id) {
      await queueService.enqueue({
        workspace_id: conversation.workspace_id,
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

        await queueService.enqueue({
          workspace_id: conversation.workspace_id,
          job_type: 'process_crm_sync',
          queue_name: 'crm',
          payload: { crm_event_id: crmEvent.id, provider: crmIntegration.provider },
        });
      }
    }

    return new Response('OK', { status: 200 });
  });
