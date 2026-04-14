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
    console.log('[Calendly] Fetching available slots:', { calendarId, start: dateRange.start, end: dateRange.end });

    const result = await this.request(
      `/event_type_available_times?event_type=${encodeURIComponent(calendarId)}&start_time=${dateRange.start}&end_time=${dateRange.end}`,
      { method: 'GET' },
    );

    const collection = (result.collection ?? []) as Array<{ start_time: string; status?: string }>;
    const slots = collection.map((slot) => slot.start_time);
    console.log(`[Calendly] Found ${slots.length} available slots (first 5):`, slots.slice(0, 5));

    return { slots };
  }

  /** Fetch an event type's required questions so we can fill them during booking */
  private async getRequiredQuestions(eventTypeUri: string): Promise<Array<{ position: number; question: string }>> {
    try {
      // Extract UUID from full URI
      const uuid = eventTypeUri.split('/').pop() ?? '';
      const result = await this.request(`/event_types/${uuid}`, { method: 'GET' });
      const resource = result.resource as Record<string, unknown> | undefined;
      const questions = (resource?.custom_questions ?? []) as Array<{
        name: string;
        position: number;
        required: boolean;
        type: string;
        enabled: boolean;
      }>;

      const required = questions.filter(q => q.required && q.enabled);
      console.log(`[Calendly] Event type has ${required.length} required questions:`, required.map(q => q.name));
      return required.map(q => ({ position: q.position, question: q.name }));
    } catch (err) {
      console.warn('[Calendly] Failed to fetch event type questions:', err);
      return [];
    }
  }

  async createBooking(input: BookingInput): Promise<BookingResult> {
    console.log('[Calendly] createBooking input:', {
      event_type: input.calendar_id,
      start_time: input.start_time,
      lead_name: input.lead_name,
      lead_email: input.lead_email,
      lead_phone: input.lead_phone,
      lead_timezone: input.lead_timezone,
    });

    // Fetch required questions for this event type and auto-fill answers
    const requiredQuestions = await this.getRequiredQuestions(input.calendar_id);
    const questionsAndAnswers = requiredQuestions.map(q => ({
      question: q.question,
      answer: this.autoFillAnswer(q.question, input),
      position: q.position,
    }));

    const requestBody: Record<string, unknown> = {
      event_type: input.calendar_id,
      start_time: input.start_time,
      invitee: {
        name: input.lead_name,
        email: input.lead_email,
        timezone: input.lead_timezone ?? 'Australia/Melbourne',
      },
    };

    if (questionsAndAnswers.length > 0) {
      requestBody.questions_and_answers = questionsAndAnswers;
      console.log('[Calendly] Auto-filled required questions:', questionsAndAnswers);
    }

    // Add SMS reminder if we have a phone number
    if (input.lead_phone) {
      (requestBody.invitee as Record<string, unknown>).text_reminder_number = input.lead_phone;
    }

    console.log('[Calendly] POST /invitees request:', JSON.stringify(requestBody, null, 2));

    const result = await this.request('/invitees', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });
    console.log('[Calendly] POST /invitees response:', JSON.stringify(result, null, 2));

    const resource = result.resource as Record<string, unknown> | undefined;
    const eventUri = String(resource?.event ?? '');
    const cancelUrl = String(resource?.cancel_url ?? '');
    const rescheduleUrl = String(resource?.reschedule_url ?? '');
    const inviteeUri = String(resource?.uri ?? '');

    const bookingResult: BookingResult = {
      booking_id: inviteeUri || `calendly_${Date.now()}`,
      booking_url: rescheduleUrl || input.calendar_id,
      scheduled_at: input.start_time,
      event_uri: eventUri,
      cancel_url: cancelUrl,
      reschedule_url: rescheduleUrl,
      raw_response: result,
    };

    console.log('[Calendly] Booking created:', {
      booking_id: bookingResult.booking_id,
      event_uri: bookingResult.event_uri,
      scheduled_at: bookingResult.scheduled_at,
      cancel_url: bookingResult.cancel_url,
      reschedule_url: bookingResult.reschedule_url,
    });

    return bookingResult;
  }

  /** Best-effort auto-fill for common Calendly custom questions */
  private autoFillAnswer(question: string, input: BookingInput): string {
    const q = question.toLowerCase();
    if (q.includes('phone') || q.includes('number') || q.includes('mobile') || q.includes('cell')) {
      return input.lead_phone || 'N/A';
    }
    if (q.includes('name') || q.includes('full name')) {
      return input.lead_name || 'N/A';
    }
    if (q.includes('email')) {
      return input.lead_email || 'N/A';
    }
    if (q.includes('company') || q.includes('business') || q.includes('organisation') || q.includes('organization')) {
      return input.lead_company || 'Provided via SMS';
    }
    if (q.includes('website') || q.includes('url')) {
      return 'N/A';
    }
    // Default for any other required question
    return input.lead_company || 'Booked via SMS chatbot';
  }

  async cancelBooking(bookingId: string): Promise<{ success: boolean }> {
    // bookingId can be a full event URI or just a UUID
    const eventUuid = bookingId.includes('/scheduled_events/')
      ? bookingId.split('/scheduled_events/')[1].split('/')[0]
      : bookingId;

    console.log(`[Calendly] Cancelling event: ${eventUuid}`);
    try {
      await this.request(`/scheduled_events/${eventUuid}/cancellation`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Cancelled via Kong SMS' }),
      });
      console.log(`[Calendly] Event ${eventUuid} cancelled successfully`);
      return { success: true };
    } catch (err) {
      console.error(`[Calendly] Failed to cancel event ${eventUuid}:`, err);
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
