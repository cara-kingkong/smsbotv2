import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { BookingService } from '../../src/lib/calendar/service';
import { ConversationService } from '../../src/lib/conversations/service';
import { LeadService } from '../../src/lib/leads/service';
import { CalendlyAdapter } from '../../src/lib/calendar/adapters/calendly';
import { ConversationOutcome, ConversationStatus } from '../../src/lib/types';

/**
 * Background function: Validate and execute booking.
 */
export default async (req: Request, _context: Context) => {
  const db = getServiceClient();

  try {
    const { conversation_id, recommended_calendar_id, lead_id, agent_id } = await req.json() as {
      conversation_id: string;
      recommended_calendar_id: string;
      lead_id: string;
      agent_id: string;
    };

    const calendlyAdapter = new CalendlyAdapter(process.env.CALENDLY_API_KEY!);
    const bookingService = new BookingService(db, calendlyAdapter);
    const conversationService = new ConversationService(db);
    const leadService = new LeadService(db);

    const lead = await leadService.getById(lead_id);
    if (!lead) throw new Error(`Lead not found: ${lead_id}`);

    // Validate recommendation against deterministic rules
    const validation = await bookingService.validateBookingRecommendation({
      recommended_calendar_id,
      agent_id,
      lead_data: { phone: lead.phone_e164, email: lead.email },
    });

    if (!validation.valid || !validation.calendar) {
      console.warn(`Booking validation failed for conversation ${conversation_id}: ${validation.reason}`);
      return new Response('Validation failed', { status: 200 });
    }

    // Execute booking
    await bookingService.executeBooking(
      {
        calendar_id: validation.calendar.booking_url,
        lead_name: `${lead.first_name} ${lead.last_name}`.trim(),
        lead_email: lead.email ?? '',
        lead_phone: lead.phone_e164,
      },
      conversation_id,
    );

    // Update conversation outcome
    await conversationService.setOutcome(conversation_id, ConversationOutcome.Booked);
    await conversationService.updateStatus(conversation_id, ConversationStatus.Completed);

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('process-booking-background error:', err);
    return new Response('Error', { status: 500 });
  }
};
