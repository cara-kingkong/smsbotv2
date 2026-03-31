import type { Context } from '@netlify/functions';
import { BookingService } from '../../src/lib/calendar/service';
import { ConversationService } from '../../src/lib/conversations/service';
import { LeadService } from '../../src/lib/leads/service';
import { CalendlyAdapter } from '../../src/lib/calendar/adapters/calendly';
import { ConversationOutcome, ConversationStatus, CRMEventType } from '../../src/lib/types';
import { CRMService } from '../../src/lib/crm/service';
import { runQueueJob } from '../../src/lib/queues/job-runner';

interface ProcessBookingPayload {
  conversation_id: string;
  recommended_calendar_id: string;
  lead_id: string;
  agent_id: string;
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

    const conversationService = new ConversationService(db);
    const conversation = await conversationService.getById(conversation_id);
    if (!conversation) return new Response('Skipped', { status: 200 });

    const calendlyAdapter = new CalendlyAdapter(process.env.CALENDLY_API_KEY!);
    const bookingService = new BookingService(db, calendlyAdapter);
    const leadService = new LeadService(db);

    const lead = await leadService.getById(lead_id);
    if (!lead) throw new Error(`Lead not found: ${lead_id}`);

    const validation = await bookingService.validateBookingRecommendation({
      recommended_calendar_id,
      agent_id,
      lead_data: { phone: lead.phone_e164, email: lead.email },
    });

    if (!validation.valid || !validation.calendar) {
      console.warn(`Booking validation failed for conversation ${conversation_id}: ${validation.reason}`);
      return new Response('Validation failed', { status: 200 });
    }

    await heartbeat();
    await bookingService.executeBooking(
      {
        calendar_id: validation.calendar.booking_url,
        lead_name: `${lead.first_name} ${lead.last_name}`.trim(),
        lead_email: lead.email ?? '',
        lead_phone: lead.phone_e164,
      },
      conversation_id,
    );

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
