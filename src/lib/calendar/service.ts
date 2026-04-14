import type { SupabaseClient } from '@supabase/supabase-js';
import type { Calendar, CalendarAdapter, BookingInput, BookingResult } from '@lib/types';
import { EntityStatus, ConversationEventType } from '@lib/types';

export class BookingService {
  constructor(
    private readonly db: SupabaseClient,
    private readonly calendarAdapter: CalendarAdapter,
  ) {}

  async getCalendarsForAgent(agentId: string): Promise<Calendar[]> {
    const { data, error } = await this.db
      .from('agent_calendars')
      .select('calendar_id, calendars(*)')
      .eq('agent_id', agentId);

    if (error) throw new Error(`Failed to get agent calendars: ${error.message}`);
    return (data ?? []).map((row: Record<string, unknown>) => row.calendars as unknown as Calendar);
  }

  async getCalendarsForCampaign(campaignId: string): Promise<Calendar[]> {
    const { data, error } = await this.db
      .from('campaign_calendars')
      .select('calendar_id, calendars(*)')
      .eq('campaign_id', campaignId);

    if (error) throw new Error(`Failed to get campaign calendars: ${error.message}`);
    return (data ?? []).map((row: Record<string, unknown>) => row.calendars as unknown as Calendar);
  }

  /** Validate AI recommendation against deterministic rules */
  async validateBookingRecommendation(input: {
    recommended_calendar_id: string;
    agent_id: string;
    campaign_id?: string;
    lead_data: Record<string, unknown>;
  }): Promise<{ valid: boolean; calendar: Calendar | null; reason: string }> {
    const calendars = input.campaign_id
      ? await this.getCalendarsForCampaign(input.campaign_id)
      : await this.getCalendarsForAgent(input.agent_id);
    const target = calendars.find((c) => c.id === input.recommended_calendar_id);

    if (!target) {
      return { valid: false, calendar: null, reason: 'Calendar not assigned to agent' };
    }

    if (target.status !== EntityStatus.Active) {
      return { valid: false, calendar: null, reason: 'Calendar is not active' };
    }

    // Future: evaluate eligibility_rules_json against lead_data
    return { valid: true, calendar: target, reason: 'Eligible' };
  }

  async executeBooking(input: BookingInput, conversationId: string): Promise<BookingResult> {
    // Log booking initiation
    await this.db.from('conversation_events').insert({
      conversation_id: conversationId,
      event_type: ConversationEventType.BookingInitiated,
      event_payload_json: { calendar_id: input.calendar_id },
    });

    try {
      const result = await this.calendarAdapter.createBooking(input);

      // Log success with full Calendly event data
      await this.db.from('conversation_events').insert({
        conversation_id: conversationId,
        event_type: ConversationEventType.BookingConfirmed,
        event_payload_json: {
          booking_id: result.booking_id,
          event_uri: result.event_uri ?? null,
          cancel_url: result.cancel_url ?? null,
          reschedule_url: result.reschedule_url ?? null,
          scheduled_at: result.scheduled_at,
        },
      });

      return result;
    } catch (err) {
      // Log failure
      await this.db.from('conversation_events').insert({
        conversation_id: conversationId,
        event_type: ConversationEventType.BookingFailed,
        event_payload_json: { error: err instanceof Error ? err.message : 'Unknown' },
      });
      throw err;
    }
  }
}
