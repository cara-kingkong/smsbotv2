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
        body: JSON.stringify({ reason: 'Cancelled via Kong SMS' }),
      });
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  async listEventTypes(options?: {
    search?: string;
    includeInactive?: boolean;
  }): Promise<Array<{
    uri: string;
    name: string;
    slug: string;
    scheduling_url: string;
    duration: number;
    active: boolean;
  }>> {
    const me = await this.request('/users/me', { method: 'GET' });
    const resource = me.resource as Record<string, unknown>;
    const userUri = resource?.uri as string;
    const orgUri = (resource?.current_organization as string) ?? null;

    if (!userUri) {
      throw new Error('Could not resolve Calendly user URI');
    }

    // Fetch all pages for the user scope
    const allEventTypes: Array<Record<string, unknown>> = [];
    await this.fetchAllEventTypePages(allEventTypes, 'user', userUri, options?.includeInactive);

    // Also fetch organization-scoped event types if available
    if (orgUri) {
      await this.fetchAllEventTypePages(allEventTypes, 'organization', orgUri, options?.includeInactive);
    }

    // Deduplicate by URI
    const seen = new Set<string>();
    const unique = allEventTypes.filter((et) => {
      const uri = String(et.uri ?? '');
      if (seen.has(uri)) return false;
      seen.add(uri);
      return true;
    });

    let results = unique.map((et) => ({
      uri: String(et.uri ?? ''),
      name: String(et.name ?? ''),
      slug: String(et.slug ?? ''),
      scheduling_url: String(et.scheduling_url ?? ''),
      duration: Number(et.duration ?? 0),
      active: Boolean(et.active ?? true),
    }));

    // Client-side search filter
    if (options?.search) {
      const q = options.search.toLowerCase();
      results = results.filter(
        (et) => et.name.toLowerCase().includes(q) || et.slug.toLowerCase().includes(q),
      );
    }

    return results;
  }

  private async fetchAllEventTypePages(
    collector: Array<Record<string, unknown>>,
    scope: 'user' | 'organization',
    scopeUri: string,
    includeInactive?: boolean,
  ): Promise<void> {
    let pageToken: string | null = null;
    const maxPages = 10; // safety limit

    for (let page = 0; page < maxPages; page++) {
      const params = new URLSearchParams({
        [scope]: scopeUri,
        count: '100',
      });
      if (!includeInactive) params.set('active', 'true');
      if (pageToken) params.set('page_token', pageToken);

      const result = await this.request(`/event_types?${params.toString()}`, { method: 'GET' });
      const collection = (result.collection ?? []) as Array<Record<string, unknown>>;
      collector.push(...collection);

      const pagination = result.pagination as Record<string, unknown> | undefined;
      const nextPage = pagination?.next_page_token as string | undefined;
      if (!nextPage) break;
      pageToken = nextPage;
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
