import Anthropic from '@anthropic-ai/sdk';
import type { AIProviderAdapter, AIPromptContext, AIDecision } from '@lib/types';
import { QualificationState } from '@lib/types';

const DECISION_SCHEMA = `
You must respond with ONLY valid JSON matching this schema (no other text):
{
  "should_reply": boolean,
  "reply_text": string,
  "qualification_state": "unknown" | "exploring" | "qualified" | "unqualified" | "needs_more_info",
  "should_offer_times": boolean,
  "should_book": boolean,
  "should_cancel_booking": boolean,
  "confirmed_time": string | null,
  "recommended_calendar_id": string | null,
  "escalate_to_human": boolean,
  "tags_to_emit": string[],
  "confidence_notes": string[],
  "reason_summary": string
}

RESPONSE FIELD GUIDE (how the system interprets your JSON):

reply_text: The SMS to send. Keep it short (1-2 sentences). Never include URLs or booking links.

qualification_state: Your assessment of the lead right now.
  "unknown" = just started, "exploring" = qualifying in progress,
  "qualified" = meets criteria, "unqualified" = doesn't meet criteria,
  "needs_more_info" = need to ask more.

should_offer_times: Set true ONLY after the lead has agreed to book a call. Do NOT set
  this on the same turn you pitch the strategy session — first ask if they want a call,
  wait for them to say yes, THEN set should_offer_times on the next turn.
  This is HOW you initiate booking — do NOT escalate to human instead.
  The system will fetch real available times from the calendar and append them to your
  reply_text automatically. Your reply_text should transition naturally to booking, e.g.
  "Perfect. I'll get you booked in now." and the system appends the times.
  Do NOT set should_book at the same time.
  If the lead rejects the offered times and suggests something else, set should_offer_times
  again and the system will offer a wider range.
  If calendars are available, ALWAYS use should_offer_times to start booking. Never escalate
  just because you're moving to the booking stage.

should_book: Set true ONLY after the lead has been shown available times AND confirmed
  a specific one. Never set this without the lead confirming a time first.

should_cancel_booking: Set true when the lead explicitly asks to cancel their booking.
  The system will cancel it in Calendly automatically. Your reply_text should confirm
  the cancellation warmly (e.g. "No worries, I've cancelled that for you").

confirmed_time: When should_book is true, set this to the exact ISO 8601 timestamp from
  available_slots that matches the lead's choice. Match their casual reply (e.g. "2pm
  Tuesday") to the nearest available_slot and copy its timestamp exactly. Never construct
  timestamps yourself.

recommended_calendar_id: When should_offer_times or should_book is true, pick a calendar
  from the available calendars list. If there's only one, use it. If multiple, pick the
  best fit. When unsure, use the first one.

escalate_to_human: Set true ONLY when genuinely stuck or the lead explicitly asks for a
  real person. Do NOT escalate when it's time to book — use should_offer_times instead.
  Do NOT escalate because you're unsure which calendar to use — just pick one.

tags_to_emit: Labels for this lead (e.g. "agency", "ecommerce", "course"). The lead never sees these.
confidence_notes: Internal reasoning notes. The lead never sees these.
reason_summary: Brief explanation of your decision. The lead never sees this.

BOOKING SEQUENCE (enforced by the system):
1. You set should_offer_times → system fetches real times → appends them to your reply
2. Lead picks a time → you set should_book + confirmed_time → system creates booking
3. System sends the confirmation SMS automatically (you don't need to confirm details)

CRITICAL — WHEN available_slots ARE LISTED BELOW:
The lead has ALREADY been shown these times. You MUST act on them NOW:
- If the lead's reply matches a slot → set should_book: true and confirmed_time to that slot's ISO timestamp. Do NOT say "let me find a slot" or "let me check" — you already have them.
- If the lead's reply doesn't match any slot → suggest the nearest one from the list.
- Each slot is shown as: ISO_TIMESTAMP = Formatted Day and Time. Use the ISO timestamp (left side) as confirmed_time.
`;

export class AnthropicAdapter implements AIProviderAdapter {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateReply(context: AIPromptContext): Promise<AIDecision> {
    const slotsInfo = context.available_slots && context.available_slots.length > 0
      ? '\nAvailable slots (already offered to lead):\n' + formatSlotsForContext(context.available_slots, context.lead.timezone)
      : '';

    const systemPrompt = [
      context.system_prompt,
      '',
      'Available calendars: ' + (context.available_calendars.length > 0
        ? context.available_calendars.map((c) => `${c.id} (${c.name})`).join(', ')
        : 'none'),
      slotsInfo,
      '',
      `Lead: ${context.lead.first_name} ${context.lead.last_name ?? ''}`.trim(),
      context.lead.timezone ? `Timezone: ${context.lead.timezone}` : '',
      '',
      DECISION_SCHEMA,
    ].join('\n');

    const messages: Anthropic.MessageParam[] = context.conversation_history.map((msg) => ({
      role: msg.direction === 'inbound' ? 'user' as const : 'assistant' as const,
      content: msg.body_text,
    }));

    // Ensure messages alternate and start with user
    if (messages.length === 0 || messages[0].role !== 'user') {
      messages.unshift({ role: 'user', content: '[Conversation started]' });
    }

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: systemPrompt,
      messages,
    });

    const raw = response.content[0]?.type === 'text' ? response.content[0].text : '{}';

    try {
      return JSON.parse(raw) as AIDecision;
    } catch {
      return {
        should_reply: true,
        reply_text: raw,
        qualification_state: QualificationState.Unknown,
        should_offer_times: false,
        should_book: false,
        should_cancel_booking: false,
        confirmed_time: null,
        recommended_calendar_id: null,
        escalate_to_human: true,
        tags_to_emit: [],
        confidence_notes: ['Failed to parse structured output'],
        reason_summary: 'Structured output parse failure — escalating',
      };
    }
  }
}

/** Format ISO slots with human-readable times so the AI can match them */
function formatSlotsForContext(slots: string[], timezone?: string | null): string {
  const tz = timezone ?? 'Australia/Melbourne';
  return slots.map((iso) => {
    const d = new Date(iso);
    const formatted = d.toLocaleString('en-AU', {
      timeZone: tz,
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `  ${iso} = ${formatted}`;
  }).join('\n');
}
