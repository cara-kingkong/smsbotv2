import type { CalendarAdapter, BookingInput, BookingResult } from '@lib/types';

export class CalendlyAdapter implements CalendarAdapter {
  private baseUrl = 'https://api.calendly.com';

  constructor(private readonly apiKey: string) {}

  private async request(path: string, options: RequestInit): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Calendly API error ${response.status}: ${body}`);
    }

    return response.json() as Promise<Record<string, unknown>>;
  }

  async listAvailableSlots(calendarId: string, dateRange: { start: string; end: string }): Promise<{ slots: string[] }> {
    const result = await this.request(
      `/event_type_available_times?event_type=${encodeURIComponent(calendarId)}&start_time=${dateRange.start}&end_time=${dateRange.end}`,
      { method: 'GET' },
    );

    const collection = (result.collection ?? []) as Array<{ start_time: string }>;
    return {
      slots: collection.map((slot) => slot.start_time),
    };
  }

  async createBooking(input: BookingInput): Promise<BookingResult> {
    // Calendly uses scheduling links rather than direct API booking.
    // For MVP, return the booking link for the agent to share.
    // Future: use Calendly's invitee creation API if available.
    return {
      booking_id: `calendly_${Date.now()}`,
      booking_url: input.calendar_id, // The calendar's booking_url
      scheduled_at: new Date().toISOString(),
      raw_response: { method: 'booking_link_shared', calendar_id: input.calendar_id },
    };
  }

  async cancelBooking(bookingId: string): Promise<{ success: boolean }> {
    try {
      await this.request(`/scheduled_events/${bookingId}/cancellation`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Cancelled via RuFlo' }),
      });
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      await this.request('/users/me', { method: 'GET' });
      return { ok: true, message: 'Calendly connection healthy' };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Unknown error' };
    }
  }
}
