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
import { PhoneNumberService } from '../../src/lib/messaging/phone-numbers';
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
import type { AIProviderAdapter, Calendar } from '../../src/lib/types';
import { CalendlyAdapter } from '../../src/lib/calendar/adapters/calendly';
import { isWithinBusinessHours, getNextBusinessHoursStart } from '../../src/lib/utils/business-hours';
import { evaluateStopConditions } from '../../src/lib/utils/stop-conditions';
import { detectBookingAcceptance } from '../../src/lib/utils/booking-guard';
import { runQueueJob } from '../../src/lib/queues/job-runner';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

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
    const phoneNumbers = new PhoneNumberService(db);

    // Parallel fetch: version, lead, campaign are independent lookups
    const [version, lead, campaign] = await Promise.all([
      agentService.getVersionById(conversation.agent_version_id),
      leadService.getById(conversation.lead_id),
      campaignService.getById(conversation.campaign_id),
    ]);

    if (!version) throw new Error(`Conversation ${conversation_id} is missing agent version ${conversation.agent_version_id}`);
    if (version.agent_id !== conversation.agent_id) {
      throw new Error(
        `Conversation ${conversation_id} references version ${version.id} that does not belong to agent ${conversation.agent_id}`,
      );
    }
    if (!lead) throw new Error(`Lead not found: ${conversation.lead_id}`);
    if (!campaign) throw new Error(`Campaign not found: ${conversation.campaign_id}`);

    const workspaceService = new WorkspaceService(db);
    const workspace = await workspaceService.getById(campaign.workspace_id);

    // Resolve the outbound "from" number for this lead. MUST match the
    // lead's country — we never send into a country the workspace hasn't
    // configured. No cross-country fallback, no env-var backdoor.
    const resolvedNumber = await phoneNumbers.resolveForLead(conversation.workspace_id, lead.phone_e164);
    if (!resolvedNumber) {
      const leadCountry = parsePhoneNumberFromString(lead.phone_e164)?.country ?? null;
      console.warn(
        `Send blocked for conversation ${conversation_id}: no workspace number in country ${leadCountry ?? 'unknown'}`,
      );
      await conversationService.updateStatus(conversation_id, ConversationStatus.NeedsHuman);
      await db.from('conversation_events').insert({
        conversation_id,
        event_type: 'send_blocked_no_number_for_country',
        event_payload_json: {
          workspace_id: conversation.workspace_id,
          lead_phone: lead.phone_e164,
          lead_country: leadCountry,
        },
      });
      return new Response('No outbound number for lead country', { status: 200 });
    }
    const fromNumber = resolvedNumber.e164;

    const hasCampaignStopConditions = campaign.stop_conditions_json?.max_messages !== undefined
      && Object.keys(campaign.stop_conditions_json).length > 0;
    const effectiveStopConditions = hasCampaignStopConditions
      ? campaign.stop_conditions_json
      : (workspace?.stop_conditions_json && 'max_messages' in workspace.stop_conditions_json)
        ? workspace.stop_conditions_json as typeof campaign.stop_conditions_json
        : { max_messages: 50, max_days: 14, max_no_reply_hours: 72 };

    const stopResult = await evaluateStopConditions(db, conversation, effectiveStopConditions);
    if (stopResult.should_stop) {
      // Preserve qualification-aware outcome if a prior AI run already assessed
      // the lead; only default to NoResponse when no outcome has been set.
      if (!conversation.outcome) {
        const { data: lastDecision } = await db
          .from('ai_decisions')
          .select('decision_json')
          .eq('conversation_id', conversation_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const qualState = (lastDecision?.decision_json as Record<string, unknown>)?.qualification_state;
        const outcome = qualState === 'qualified'
          ? ConversationOutcome.QualifiedNotBooked
          : qualState === 'unqualified'
            ? ConversationOutcome.Unqualified
            : ConversationOutcome.NoResponse;

        await conversationService.setOutcome(conversation_id, outcome);
      }
      await conversationService.updateStatus(conversation_id, ConversationStatus.Completed);
      await db.from('conversation_events').insert({
        conversation_id,
        event_type: ConversationEventType.StopConditionReached,
        event_payload_json: { reason: stopResult.reason, preserved_outcome: conversation.outcome ?? null },
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
    const calendars = await bookingService.getCalendarsForCampaign(conversation.campaign_id);

    let providerKey = 'openai';
    if (version.config_json && typeof version.config_json === 'object' && 'provider' in version.config_json) {
      providerKey = version.config_json.provider as string;
    }
    if (!aiAdapters.has(providerKey)) {
      providerKey = aiAdapters.keys().next().value ?? 'openai';
    }

    if (calendars.length === 0) {
      console.warn(`Campaign ${conversation.campaign_id} has no calendars assigned — booking will require human intervention`);
    }

    // Check for previously offered slots so the AI can reference them
    const { data: priorSlotsEvent } = await db
      .from('conversation_events')
      .select('event_payload_json')
      .eq('conversation_id', conversation_id)
      .eq('event_type', ConversationEventType.SlotsOffered)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const previouslyOfferedSlots = (priorSlotsEvent?.event_payload_json as Record<string, unknown>)?.slots as string[] | undefined;

    await heartbeat();
    const decision = await aiService.generateReply({
      agent_version: version,
      conversation_history: history,
      lead,
      available_calendar_ids: calendars.map((c) => c.id),
      available_calendars: calendars.map((c) => ({ id: c.id, name: c.name })),
      available_slots: previouslyOfferedSlots,
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
        should_offer_times: decision.should_offer_times,
        should_book: decision.should_book,
        confirmed_time: decision.confirmed_time,
      },
    });

    // ── Persist qualification outcome so it rolls up to dashboard ──
    // Booked takes precedence; otherwise promote the AI's assessment.
    if (
      decision.qualification_state === 'qualified' &&
      conversation.outcome !== ConversationOutcome.Booked
    ) {
      await conversationService.setOutcome(conversation_id, ConversationOutcome.QualifiedNotBooked);
    } else if (
      decision.qualification_state === 'unqualified' &&
      !conversation.outcome
    ) {
      await conversationService.setOutcome(conversation_id, ConversationOutcome.Unqualified);
    }

    // ── Phase 1: Offer available time slots ──────────────────────
    if (decision.should_offer_times && !decision.should_book && calendars.length > 0) {
      const slotsCalendar = calendars[0];
      const isReOffer = !!priorSlotsEvent;
      const allSlots = await fetchAllCalendlySlots(db, slotsCalendar);
      const offeredSlots = isReOffer
        ? spreadSlots(allSlots, 3)
        : pickInitialSlots(allSlots, lead.timezone);

      if (offeredSlots.length > 0) {
        const formatted = isReOffer
          ? formatSlotsFallback(offeredSlots, lead.timezone)
          : formatSlotsInitial(offeredSlots, lead.timezone);
        const combinedReply = decision.reply_text
          ? `${decision.reply_text}\n\n${formatted}`
          : formatted;

        await heartbeat();
        const message = await messagingService.sendOutbound({
          conversation_id,
          to: lead.phone_e164,
          from: fromNumber,
          body_text: combinedReply,
          sender_type: SenderType.AI,
          source_job_id: jobId,
        });

        await db.from('ai_decisions')
          .update({ message_id: message.id })
          .eq('conversation_id', conversation_id)
          .is('message_id', null)
          .order('created_at', { ascending: false })
          .limit(1);

        await db.from('conversation_events').insert({
          conversation_id,
          event_type: ConversationEventType.SlotsOffered,
          event_payload_json: {
            calendar_id: slotsCalendar.id,
            calendar_name: slotsCalendar.name,
            slots: offeredSlots,
            slot_count: offeredSlots.length,
          },
        });

        await conversationService.updateStatus(conversation_id, ConversationStatus.WaitingForLead);
        return new Response('Slots offered', { status: 200 });
      }
      // If no slots available, fall through to let the AI reply go out normally
      console.warn(`No available slots found for calendar ${slotsCalendar.id} — falling through`);
    }

    // ── Cancel existing booking if requested ───────────────────
    if (decision.should_cancel_booking) {
      const { data: bookingRefs } = await db
        .from('conversation_events')
        .select('event_payload_json')
        .eq('conversation_id', conversation_id)
        .eq('event_type', 'booking_reference')
        .order('created_at', { ascending: false });

      let cancelled = false;
      if (bookingRefs && bookingRefs.length > 0) {
        // Get a Calendly adapter to perform the cancellation
        const cancelCalendar = calendars[0];
        if (cancelCalendar) {
          const { data: calIntegration } = await db
            .from('integrations')
            .select('config_json')
            .eq('id', cancelCalendar.integration_id)
            .maybeSingle();

          const calConfig = (calIntegration?.config_json ?? {}) as Record<string, unknown>;
          const calApiKeyRef = String(calConfig.api_key_ref ?? 'CALENDLY_API_KEY');
          const calApiKey = process.env[calApiKeyRef];

          if (calApiKey) {
            const cancelAdapter = new CalendlyAdapter(calApiKey);
            for (const ref of bookingRefs) {
              const eventUri = (ref.event_payload_json as Record<string, unknown>)?.event_uri as string | undefined;
              if (eventUri) {
                const result = await cancelAdapter.cancelBooking(eventUri);
                if (result.success) {
                  cancelled = true;
                  await db.from('conversation_events').insert({
                    conversation_id,
                    event_type: 'booking_cancelled',
                    event_payload_json: { event_uri: eventUri, reason: 'lead_requested' },
                  });
                }
              }
            }
          }
        }
      }

      console.log(`[Cancel] Booking cancellation for ${conversation_id}: ${cancelled ? 'success' : 'no booking found'}`);
    }

    const bookingAcceptance = detectBookingAcceptance(history);
    let tookAction = false;

    if (decision.escalate_to_human) {
      // If the AI wants to escalate but also wants to book or offer times, and we
      // can resolve a calendar, suppress the escalation and continue the booking flow.
      const resolvedCalendarId = decision.recommended_calendar_id
        ?? (calendars.length > 0 ? calendars[0].id : null);

      if ((decision.should_book || decision.should_offer_times) && resolvedCalendarId) {
        decision.escalate_to_human = false;
        decision.recommended_calendar_id = resolvedCalendarId;
      } else {
        await db.from('conversation_events').insert({
          conversation_id,
          event_type: 'booking_needs_human',
          event_payload_json: {
            reason: 'ai_escalation',
            should_book: decision.should_book,
            recommended_calendar_id: decision.recommended_calendar_id,
          },
        });
        await conversationService.updateStatus(conversation_id, ConversationStatus.NeedsHuman);
        try {
          await queueSystemMessage(queueService, db, {
            workspaceId: conversation.workspace_id,
            conversationId: conversation_id,
            to: lead.phone_e164,
            bodyText: 'Thanks, I am handing this off so we can confirm the booking details for you.',
            sourceJobId: undefined,
          });
        } catch (err) {
          console.error('Failed to queue escalation SMS:', err);
        }
        return new Response('Escalated', { status: 200 });
      }
    }

    // Skip the AI reply when a booking is about to be queued — the booking
    // background function sends a proper confirmation with time and email.
    const bookingWillQueue = decision.should_book
      && (decision.recommended_calendar_id || calendars.length > 0);

    if (decision.should_reply && decision.reply_text && !bookingWillQueue) {
      tookAction = true;
      await heartbeat();
      const message = await messagingService.sendOutbound({
        conversation_id,
        to: lead.phone_e164,
        from: fromNumber,
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

    let bookingQueued = false;

    // Resolve calendar when AI says book but didn't pick one
    if (decision.should_book && !decision.recommended_calendar_id && calendars.length > 0) {
      decision.recommended_calendar_id = calendars[0].id;
    }

    if (decision.should_book && decision.recommended_calendar_id) {
      await db.from('conversation_events').insert({
        conversation_id,
        event_type: 'booking_queued',
        event_payload_json: {
          source: 'ai_decision',
          recommended_calendar_id: decision.recommended_calendar_id,
          confirmed_time: decision.confirmed_time,
          qualification_state: decision.qualification_state,
        },
      });
      await queueService.enqueue({
        workspace_id: conversation.workspace_id,
        job_type: 'process_booking',
        queue_name: 'booking',
        payload: {
          conversation_id,
          recommended_calendar_id: decision.recommended_calendar_id,
          confirmed_time: decision.confirmed_time,
          lead_id: lead.id,
          agent_id: conversation.agent_id,
          campaign_id: conversation.campaign_id,
        },
      });
      bookingQueued = true;
      tookAction = true;
    } else if (decision.should_book && !decision.recommended_calendar_id) {
      // AI wants to book but no calendar could be resolved
      await db.from('conversation_events').insert({
        conversation_id,
        event_type: 'booking_needs_human',
        event_payload_json: {
          reason: calendars.length === 0 ? 'no_assigned_calendar' : 'ambiguous_calendar_selection',
          should_book: true,
          available_calendars: calendars.map((c) => c.id),
        },
      });
      await conversationService.updateStatus(conversation_id, ConversationStatus.NeedsHuman);
      if (!tookAction) {
        try {
          await queueSystemMessage(queueService, db, {
            workspaceId: conversation.workspace_id,
            conversationId: conversation_id,
            to: lead.phone_e164,
            bodyText: 'Thanks, a team member will confirm the booking details for you shortly.',
            sourceJobId: undefined,
          });
        } catch (err) {
          console.error('Failed to queue booking-needs-human SMS:', err);
        }
      }
      return new Response('Booking needs human — no resolvable calendar', { status: 200 });
    } else if (
      bookingAcceptance.acceptanceDetected &&
      calendars.length > 0
    ) {
      const fallbackCalendarId = calendars[0].id;
      await db.from('conversation_events').insert({
        conversation_id,
        event_type: 'booking_acceptance_detected',
        event_payload_json: {
          source: 'deterministic_fallback',
          evidence: bookingAcceptance.evidence,
          fallback_calendar_id: fallbackCalendarId,
          qualification_state: decision.qualification_state,
        },
      });
      await db.from('conversation_events').insert({
        conversation_id,
        event_type: 'booking_queued',
        event_payload_json: {
          source: 'deterministic_fallback',
          recommended_calendar_id: fallbackCalendarId,
          evidence: bookingAcceptance.evidence,
        },
      });
      await queueService.enqueue({
        workspace_id: conversation.workspace_id,
        job_type: 'process_booking',
        queue_name: 'booking',
        payload: {
          conversation_id,
          recommended_calendar_id: fallbackCalendarId,
          lead_id: lead.id,
          agent_id: conversation.agent_id,
          campaign_id: conversation.campaign_id,
        },
      });
      bookingQueued = true;
      tookAction = true;
    } else if (bookingAcceptance.acceptanceDetected) {
      // No calendars at all — escalate, but only send a system message
      // if the AI didn't already reply (avoid double messages).
      await db.from('conversation_events').insert({
        conversation_id,
        event_type: 'booking_needs_human',
        event_payload_json: {
          reason: 'no_assigned_calendar',
          evidence: bookingAcceptance.evidence,
          available_calendars: [],
        },
      });
      await conversationService.updateStatus(conversation_id, ConversationStatus.NeedsHuman);
      if (!tookAction) {
        try {
          await queueSystemMessage(queueService, db, {
            workspaceId: conversation.workspace_id,
            conversationId: conversation_id,
            to: lead.phone_e164,
            bodyText: 'Thanks, we have your preferred time. A team member will confirm the booking details shortly.',
            sourceJobId: undefined,
          });
        } catch (err) {
          console.error('Failed to queue booking-acceptance SMS:', err);
        }
      }
      return new Response('Needs human', { status: 200 });
    }

    if (!tookAction && trigger === 'inbound_message') {
      await db.from('conversation_events').insert({
        conversation_id,
        event_type: 'ai_no_action',
        event_payload_json: {
          qualification_state: decision.qualification_state,
          should_reply: decision.should_reply,
          should_book: decision.should_book,
          recommended_calendar_id: decision.recommended_calendar_id,
          acceptance_detected: bookingAcceptance.acceptanceDetected,
          evidence: bookingAcceptance.evidence,
        },
      });
      await conversationService.updateStatus(conversation_id, ConversationStatus.NeedsHuman);
      try {
        await queueSystemMessage(queueService, db, {
          workspaceId: conversation.workspace_id,
          conversationId: conversation_id,
          to: lead.phone_e164,
          bodyText: 'Thanks for the message. A team member is reviewing the next step and will follow up shortly.',
          sourceJobId: undefined,
        });
      } catch (err) {
        console.error('Failed to queue ai-no-action SMS:', err);
      }
      return new Response('Needs human', { status: 200 });
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

    if (bookingQueued && !decision.should_reply) {
      await conversationService.updateStatus(conversation_id, ConversationStatus.Active);
    }

    return new Response('OK', { status: 200 });
  });

async function queueSystemMessage(
  queueService: {
    enqueue: (input: {
      workspace_id: string;
      job_type: string;
      queue_name: string;
      payload: Record<string, unknown>;
    }) => Promise<unknown>;
  },
  db: {
    from: (table: string) => {
      select: () => unknown;
      insert: (data: Record<string, unknown>) => {
        select: () => { single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }> };
      };
      update?: () => unknown;
      eq?: () => unknown;
    };
  },
  input: {
    workspaceId: string;
    conversationId: string;
    to: string;
    bodyText: string;
    sourceJobId?: string;
  },
) {
  const messagingService = new MessagingService(db as never, {} as never);
  const message = await messagingService.queueOutbound({
    conversation_id: input.conversationId,
    body_text: input.bodyText,
    sender_type: SenderType.System,
    source_job_id: input.sourceJobId,
  });

  // `from` is intentionally omitted — process-send-sms-background resolves
  // the workspace's country-matched number (or env fallback) at send time.
  await queueService.enqueue({
    workspace_id: input.workspaceId,
    job_type: 'process_send_sms',
    queue_name: 'sms',
    payload: {
      message_id: message.id,
      conversation_id: input.conversationId,
      to: input.to,
    },
  });
}

/** Fetch all available Calendly slots for the next 7 days (raw, unpicked) */
async function fetchAllCalendlySlots(
  db: { from: (table: string) => ReturnType<import('@supabase/supabase-js').SupabaseClient['from']> },
  calendar: Calendar,
): Promise<string[]> {
  if (!calendar.integration_id) return [];

  const { data: integration } = await db
    .from('integrations')
    .select('config_json')
    .eq('id', calendar.integration_id)
    .maybeSingle();

  if (!integration) return [];

  const config = (integration.config_json ?? {}) as Record<string, unknown>;
  const apiKeyRef = String(config.api_key_ref ?? 'CALENDLY_API_KEY');
  const apiKey = process.env[apiKeyRef];
  if (!apiKey) return [];

  const eventTypeUri = calendar.external_calendar_id ?? calendar.booking_url;
  if (!eventTypeUri) return [];

  try {
    const adapter = new CalendlyAdapter(apiKey);
    const start = new Date(Date.now() + 5 * 60 * 1000); // 5 min buffer so Calendly accepts it
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    const result = await adapter.listAvailableSlots(eventTypeUri, {
      start: start.toISOString(),
      end: end.toISOString(),
    });
    return result.slots;
  } catch (err) {
    console.warn('Failed to fetch Calendly slots:', err);
    return [];
  }
}

/** Get the weekday date string for a slot in the lead's timezone */
function slotDate(iso: string, tz: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
}

function slotDayOfWeek(iso: string, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'short' }).formatToParts(new Date(iso));
  const wd = parts.find(p => p.type === 'weekday')?.value ?? '';
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
}

/**
 * Initial offer: 2 slots from the next available weekday, 1 from the following weekday.
 * Slots on each day are spread at least 2 hours apart.
 */
function pickInitialSlots(allSlots: string[], leadTimezone?: string | null): string[] {
  const tz = leadTimezone ?? 'Australia/Melbourne';
  if (allSlots.length === 0) return [];

  // Group slots by date in lead's timezone, weekdays only
  const byDay = new Map<string, string[]>();
  for (const iso of allSlots) {
    const dow = slotDayOfWeek(iso, tz);
    if (dow === 0 || dow === 6) continue; // skip weekends
    const key = slotDate(iso, tz);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(iso);
  }

  // Get today's date in lead's tz so we skip it
  const todayKey = slotDate(new Date().toISOString(), tz);
  const days = [...byDay.keys()].filter(d => d !== todayKey).sort();

  if (days.length === 0) return spreadSlots(allSlots, 3); // fallback

  const picked: string[] = [];

  // Day 1: pick 2 spread-out slots (at least 2 hours apart)
  const day1Slots = byDay.get(days[0]) ?? [];
  if (day1Slots.length > 0) {
    picked.push(day1Slots[0]);
    for (const slot of day1Slots) {
      if (new Date(slot).getTime() - new Date(picked[0]).getTime() >= 2 * 60 * 60 * 1000) {
        picked.push(slot);
        break;
      }
    }
  }

  // Day 2: pick 1 slot
  if (days.length > 1) {
    const day2Slots = byDay.get(days[1]) ?? [];
    if (day2Slots.length > 0) picked.push(day2Slots[0]);
  }

  return picked.length > 0 ? picked : spreadSlots(allSlots, 3);
}

/** Fallback: pick slots spread at least 1 hour apart (for re-offers) */
function spreadSlots(allSlots: string[], count: number): string[] {
  if (allSlots.length === 0) return [];
  const picked: string[] = [allSlots[0]];

  for (let i = 1; i < allSlots.length && picked.length < count; i++) {
    const lastPicked = new Date(picked[picked.length - 1]).getTime();
    const candidate = new Date(allSlots[i]).getTime();
    if (candidate - lastPicked >= 60 * 60 * 1000) {
      picked.push(allSlots[i]);
    }
  }
  return picked;
}

function formatTime(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).replace(':00', '').replace(' ', '').toLowerCase(); // "2pm" not "2:00 PM"
}

function formatDayName(iso: string, tz: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { timeZone: tz, weekday: 'long' });
}

function isTomorrow(iso: string, tz: string): boolean {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return slotDate(iso, tz) === slotDate(tomorrow.toISOString(), tz);
}

/**
 * Initial format: "I've got 10am or 2pm tomorrow, or 11am Wednesday if that
 * suits better (Melbourne time) - which works?"
 */
function formatSlotsInitial(slots: string[], leadTimezone?: string | null): string {
  const tz = leadTimezone ?? 'Australia/Melbourne';
  if (slots.length === 0) return '';

  // Group by day
  const byDay = new Map<string, string[]>();
  for (const s of slots) {
    const key = slotDate(s, tz);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(s);
  }

  const dayGroups = [...byDay.entries()];
  const parts: string[] = [];

  for (const [, daySlots] of dayGroups) {
    const dayLabel = isTomorrow(daySlots[0], tz) ? 'tomorrow' : formatDayName(daySlots[0], tz);
    const times = daySlots.map(s => formatTime(s, tz));
    if (times.length === 1) {
      parts.push(`${times[0]} ${dayLabel}`);
    } else {
      parts.push(`${times.join(' or ')} ${dayLabel}`);
    }
  }

  if (parts.length === 1) {
    return `I've got ${parts[0]} available (Melbourne time) - does that work?`;
  }

  const last = parts.pop();
  return `I've got ${parts.join(', ')}, or ${last} if that suits better (Melbourne time) - which works?`;
}

/** Fallback format for re-offers (wider range, used after lead rejects initial times) */
function formatSlotsFallback(slots: string[], leadTimezone?: string | null): string {
  const tz = leadTimezone ?? 'Australia/Melbourne';

  const formatSlot = (iso: string) => `${formatTime(iso, tz)} ${formatDayName(iso, tz)}`;

  if (slots.length === 1) {
    return `I've got ${formatSlot(slots[0])} available (Melbourne time) - does that work?`;
  }

  const formatted = slots.map(formatSlot);
  const last = formatted.pop();
  return `I've got ${formatted.join(', ')}, or ${last} available (Melbourne time) - which suits?`;
}
