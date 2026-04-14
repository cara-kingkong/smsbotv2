import type { Context } from '@netlify/functions';
import { BookingService } from '../../src/lib/calendar/service';
import { ConversationService } from '../../src/lib/conversations/service';
import { LeadService } from '../../src/lib/leads/service';
import { CalendlyAdapter } from '../../src/lib/calendar/adapters/calendly';
import { MessagingService } from '../../src/lib/messaging/service';
import { TwilioAdapter } from '../../src/lib/messaging/adapters/twilio';
import {
  ConversationEventType,
  ConversationOutcome,
  ConversationStatus,
  CRMEventType,
  SenderType,
} from '../../src/lib/types';
import { CRMService } from '../../src/lib/crm/service';
import { runQueueJob } from '../../src/lib/queues/job-runner';

interface ProcessBookingPayload {
  conversation_id: string;
  recommended_calendar_id: string;
  confirmed_time?: string;
  lead_id: string;
  agent_id: string;
  campaign_id?: string;
  job_id?: string;
  worker_id?: string;
  lease_seconds?: number;
}

/**
 * Background function: Validate and execute booking.
 */
export default async (req: Request, _context: Context) =>
  runQueueJob<ProcessBookingPayload>(req, 'process-booking-background', async (payload, context) => {
    const { db, queueService, heartbeat } = context;
    const { conversation_id, recommended_calendar_id, lead_id, agent_id } = payload;
    const campaignId = payload.campaign_id;

    const conversationService = new ConversationService(db);
    const conversation = await conversationService.getById(conversation_id);
    if (!conversation) return new Response('Skipped', { status: 200 });

    const leadService = new LeadService(db);

    const lead = await leadService.getById(lead_id);
    if (!lead) throw new Error(`Lead not found: ${lead_id}`);

    const bookingService = new BookingService(db, null as never);

    const validation = await bookingService.validateBookingRecommendation({
      recommended_calendar_id,
      agent_id,
      campaign_id: campaignId ?? conversation.campaign_id,
      lead_data: { phone: lead.phone_e164, email: lead.email },
    });

    if (!validation.valid || !validation.calendar) {
      console.warn(`Booking validation failed for conversation ${conversation_id}: ${validation.reason}`);
      await db.from('conversation_events').insert({
        conversation_id,
        event_type: ConversationEventType.BookingFailed,
        event_payload_json: { error: validation.reason, stage: 'validation' },
      });
      await conversationService.updateStatus(conversation_id, ConversationStatus.NeedsHuman);
      return new Response('Validation failed', { status: 200 });
    }

    const { data: calendarIntegration, error: integrationError } = await db
      .from('integrations')
      .select('config_json')
      .eq('id', validation.calendar.integration_id)
      .maybeSingle();

    if (integrationError) {
      throw new Error(`Failed to load calendar integration: ${integrationError.message}`);
    }

    const integrationConfig = (calendarIntegration?.config_json ?? {}) as Record<string, unknown>;
    const apiKeyRef = String(integrationConfig.api_key_ref ?? 'CALENDLY_API_KEY');
    const apiKey = process.env[apiKeyRef];

    if (!apiKey) {
      await db.from('conversation_events').insert({
        conversation_id,
        event_type: ConversationEventType.BookingFailed,
        event_payload_json: { error: `Missing calendar credential: ${apiKeyRef}` },
      });
      await conversationService.updateStatus(conversation_id, ConversationStatus.NeedsHuman);
      return new Response('Calendar credentials unavailable', { status: 200 });
    }

    if (!validation.calendar.booking_url) {
      await db.from('conversation_events').insert({
        conversation_id,
        event_type: ConversationEventType.BookingFailed,
        event_payload_json: { error: 'Selected calendar is missing a booking URL' },
      });
      await conversationService.updateStatus(conversation_id, ConversationStatus.NeedsHuman);
      return new Response('Booking URL missing', { status: 200 });
    }

    const executionService = new BookingService(db, new CalendlyAdapter(apiKey));

    console.log('[Booking] Starting booking for conversation:', conversation_id, {
      calendar_id: validation.calendar.id,
      calendar_name: validation.calendar.name,
      booking_url: validation.calendar.booking_url,
      lead: { name: `${lead.first_name} ${lead.last_name}`.trim(), email: lead.email, phone: lead.phone_e164 },
      confirmed_time: payload.confirmed_time ?? 'none',
    });

    // Cancel any previous booking for this conversation before creating a new one
    const { data: priorBookings } = await db
      .from('conversation_events')
      .select('event_payload_json')
      .eq('conversation_id', conversation_id)
      .eq('event_type', 'booking_reference')
      .order('created_at', { ascending: false });

    if (priorBookings && priorBookings.length > 0) {
      const calendlyAdapter = new CalendlyAdapter(apiKey);
      for (const prior of priorBookings) {
        const eventUri = (prior.event_payload_json as Record<string, unknown>)?.event_uri as string | undefined;
        if (eventUri) {
          console.log(`[Booking] Cancelling previous booking: ${eventUri}`);
          const cancelResult = await calendlyAdapter.cancelBooking(eventUri);
          if (cancelResult.success) {
            await db.from('conversation_events').insert({
              conversation_id,
              event_type: 'booking_cancelled',
              event_payload_json: { event_uri: eventUri, reason: 'rebooked' },
            });
          }
        }
      }
    }

    // Pull the lead's business description from the latest AI decision
    const { data: latestDecision } = await db
      .from('ai_decisions')
      .select('decision_json')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const decisionJson = (latestDecision?.decision_json ?? {}) as Record<string, unknown>;
    const leadCompany = String(decisionJson.reason_summary ?? '');

    await heartbeat();
    let bookingResult;
    try {
      // Use the API event type URI for Calendly API calls, fall back to booking_url
      const eventTypeUri = validation.calendar.external_calendar_id ?? validation.calendar.booking_url;

      bookingResult = await executionService.executeBooking(
        {
          calendar_id: eventTypeUri,
          start_time: payload.confirmed_time ?? new Date().toISOString(),
          lead_name: `${lead.first_name} ${lead.last_name}`.trim(),
          lead_email: lead.email ?? '',
          lead_phone: lead.phone_e164,
          lead_timezone: lead.timezone ?? 'Australia/Melbourne',
          lead_company: leadCompany || undefined,
        },
        conversation_id,
      );
    } catch (err) {
      console.error('[Booking] executeBooking failed:', err);
      await conversationService.updateStatus(conversation_id, ConversationStatus.NeedsHuman);
      throw err;
    }

    console.log('[Booking] Booking completed:', {
      conversation_id,
      booking_id: bookingResult.booking_id,
      event_uri: bookingResult.event_uri,
      scheduled_at: bookingResult.scheduled_at,
      cancel_url: bookingResult.cancel_url,
      reschedule_url: bookingResult.reschedule_url,
    });

    // Store the full booking result for manual reference
    await db.from('conversation_events').insert({
      conversation_id,
      event_type: 'booking_reference',
      event_payload_json: {
        booking_id: bookingResult.booking_id,
        event_uri: bookingResult.event_uri ?? null,
        cancel_url: bookingResult.cancel_url ?? null,
        reschedule_url: bookingResult.reschedule_url ?? null,
        confirmed_time: payload.confirmed_time ?? null,
        calendar_id: validation.calendar.id,
        calendar_name: validation.calendar.name,
        raw_response: bookingResult.raw_response,
      },
    });

    try {
      const twilioAdapter = new TwilioAdapter(
        process.env.TWILIO_ACCOUNT_SID!,
        process.env.TWILIO_AUTH_TOKEN!,
      );
      const messagingService = new MessagingService(db, twilioAdapter);

      // Build a warm, human confirmation - no booking links (per prompt rules)
      let confirmationBody = 'You\'re all set!';
      if (lead.email) {
        confirmationBody += ` Confirmation email heading to ${lead.email} now.`;
      }
      if (payload.confirmed_time) {
        const d = new Date(payload.confirmed_time);
        const formatted = d.toLocaleString('en-AU', {
          timeZone: 'Australia/Melbourne',
          weekday: 'long',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }).replace(':00', '').toLowerCase();
        confirmationBody = `You're all set for ${formatted} (Melbourne time)! Confirmation email heading to ${lead.email ?? 'your inbox'} now.`;
      }

      const confirmationMessage = await messagingService.queueOutbound({
        conversation_id,
        body_text: confirmationBody,
        sender_type: SenderType.System,
        source_job_id: undefined,
      });

      await queueService.enqueue({
        workspace_id: conversation.workspace_id,
        job_type: 'process_send_sms',
        queue_name: 'sms',
        payload: {
          message_id: confirmationMessage.id,
          conversation_id,
          to: lead.phone_e164,
          from: process.env.TWILIO_PHONE_NUMBER!,
        },
      });

      await db.from('conversation_events').insert({
        conversation_id,
        event_type: 'booking_closeout_queued',
        event_payload_json: {
          message_id: confirmationMessage.id,
          event_uri: bookingResult.event_uri ?? null,
          cancel_url: bookingResult.cancel_url ?? null,
          reschedule_url: bookingResult.reschedule_url ?? null,
        },
      });
    } catch (err) {
      console.error('Failed to queue booking closeout SMS:', err);
      await db.from('conversation_events').insert({
        conversation_id,
        event_type: 'booking_closeout_failed',
        event_payload_json: { error: err instanceof Error ? err.message : 'Unknown error' },
      });
    }

    await conversationService.setOutcome(conversation_id, ConversationOutcome.Booked);
    await conversationService.updateStatus(conversation_id, ConversationStatus.Completed);

    const { data: crmIntegration } = await db
      .from('integrations')
      .select('id, provider')
      .eq('workspace_id', conversation.workspace_id)
      .eq('type', 'crm')
      .eq('status', 'active')
      .limit(1)
      .single();

    if (crmIntegration && lead.external_contact_id) {
      const crmService = new CRMService(db, new Map());
      const crmEvent = await crmService.emitEvent({
        workspace_id: conversation.workspace_id,
        conversation_id,
        integration_id: crmIntegration.id,
        event_type: CRMEventType.ConversationBooked,
        external_contact_id: lead.external_contact_id,
        payload: {
          external_contact_id: lead.external_contact_id,
          tag_name: 'booked',
          note_body: 'Lead booked via SMS chatbot',
        },
      });

      await queueService.enqueue({
        workspace_id: conversation.workspace_id,
        job_type: 'process_crm_sync',
        queue_name: 'crm',
        payload: { crm_event_id: crmEvent.id, provider: crmIntegration.provider },
      });
    }

    return new Response('OK', { status: 200 });
  });
