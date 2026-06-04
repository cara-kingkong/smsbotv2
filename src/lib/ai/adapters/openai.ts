import OpenAI from 'openai';
import type { AIProviderAdapter, AIPromptContext, AIDecision, OpeningMessageContext } from '@lib/types';
import { QualificationState } from '@lib/types';
import { reactionPromptNote } from '@lib/utils/reaction';
import { followupPromptNote, FOLLOWUP_USER_TURN } from '@lib/utils/followups';

const DEFAULT_OPENING_MODEL = 'gpt-4o-mini';
const DEFAULT_SUMMARY_MODEL = 'gpt-4o-mini';

const SITUATION_SUMMARY_SYSTEM_PROMPT = `You are summarizing an SMS conversation between a sales chatbot and a lead, for a sales rep who will read it in their CRM before calling the lead. Write a SHORT plain-text summary of the customer's situation, based ONLY on what the lead actually said.

Cover the following when the lead mentioned them (and ONLY then):
- Business type / industry
- Current revenue
- Marketing budget or ad spend
- Main goal or problem they want solved
- Timeline / urgency
- Notable objections, constraints or context

Rules:
- Use only facts stated by the lead. NEVER guess, infer figures, or invent numbers.
- Omit any item the lead didn't mention — do not list it as "unknown". Just leave it out.
- Format as short labelled lines, e.g. "Revenue: ~$40k/mo". Keep the whole summary under ~120 words.
- If the lead shared almost nothing useful, say so in a single line.
- Output ONLY the summary text — no preamble, no headings, no closing remarks.`;

const OPENING_SYSTEM_PROMPT = `You are writing the FIRST outbound SMS to a new lead. Below are the opening-message instructions. They may be a single message OR prompt-style guidance with conditional variants (e.g. one version when a first name is known and another when it isn't, or different versions depending on the reason for reaching out).

Your job:
- Choose the SINGLE most appropriate variant for this lead, using the first name and context provided.
- If a first name is given, address them by it; if not, use the no-name variant (never write a literal placeholder like "[Name]").
- Match the variant to the context when the instructions branch on it; if no context fits, use the most general/default variant.
- Keep it natural, warm and SMS-friendly. Preserve the sender's wording and tone — do not invent new offers, links, or emojis that the instructions don't include.

Reply with ONLY the final SMS text — no options, no quotes, no explanation.`;

const DECISION_SCHEMA = `
You must respond with valid JSON matching this schema:
{
  "should_reply": boolean,
  "reply_text": string,
  "qualification_state": "unknown" | "exploring" | "qualified" | "unqualified" | "needs_more_info",
  "should_offer_times": boolean,
  "offer_outside_business_hours": boolean,
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

offer_outside_business_hours: By default the system only offers times within business
  hours, so you never suggest unreasonable times (e.g. 4am). Set this true ONLY when the
  lead has explicitly asked for a time outside normal hours — e.g. "I work 9-5, can we do
  before or after that?" or "anything in the evening/early morning?". When you set it true,
  also set should_offer_times true so the system re-offers with out-of-hours availability
  included. Leave it false in every other case.

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

export class OpenAIAdapter implements AIProviderAdapter {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generateReply(context: AIPromptContext): Promise<AIDecision> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: [
          context.system_prompt,
          '',
          'Available calendars: ' + (context.available_calendars.length > 0
            ? context.available_calendars.map((c) => `${c.id} (${c.name})`).join(', ')
            : 'none'),
          context.available_slots && context.available_slots.length > 0
            ? '\nAvailable slots (already offered to lead):\n' + formatSlotsForContext(context.available_slots, context.lead.timezone)
            : '',
          '',
          `Lead: ${context.lead.first_name} ${context.lead.last_name ?? ''}`.trim(),
          context.lead.timezone ? `Timezone: ${context.lead.timezone}` : '',
          '',
          context.latest_inbound_reaction ? reactionPromptNote(context.latest_inbound_reaction) + '\n' : '',
          context.followup ? followupPromptNote(context.followup) + '\n' : '',
          DECISION_SCHEMA,
        ].join('\n'),
      },
    ];

    // Add conversation history
    for (const msg of context.conversation_history) {
      messages.push({
        role: msg.direction === 'inbound' ? 'user' : 'assistant',
        content: msg.body_text,
      });
    }

    // On a follow-up the transcript ends on the AI's own (assistant) message, so
    // append a synthetic user turn — otherwise the model just continues / repeats
    // itself.
    if (context.followup && messages[messages.length - 1]?.role === 'assistant') {
      messages.push({ role: 'user', content: FOLLOWUP_USER_TURN });
    }

    const completion = await this.client.chat.completions.create({
      model: context.model || 'gpt-4o',
      messages,
      response_format: { type: 'json_object' },
      temperature: context.temperature ?? 0.7,
      max_tokens: 1000,
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';

    try {
      return JSON.parse(raw) as AIDecision;
    } catch {
      // Fallback if JSON parsing fails
      return {
        should_reply: true,
        reply_text: raw,
        qualification_state: QualificationState.Unknown,
        should_offer_times: false,
        offer_outside_business_hours: false,
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

  async generateOpening(context: OpeningMessageContext): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: context.model || DEFAULT_OPENING_MODEL,
      messages: [
        { role: 'system', content: OPENING_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            context.first_name ? `Lead's first name: ${context.first_name}` : 'Lead has no first name on file.',
            `Context for outreach: ${context.context || 'none provided'}`,
            '',
            'Opening message instructions:',
            context.message,
          ].join('\n'),
        },
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    const text = completion.choices[0]?.message?.content?.trim() ?? '';
    return text || context.message;
  }

  async summarizeSituation(transcript: string): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: DEFAULT_SUMMARY_MODEL,
      messages: [
        { role: 'system', content: SITUATION_SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: transcript },
      ],
      temperature: 0.3,
      max_tokens: 400,
    });

    return completion.choices[0]?.message?.content?.trim() ?? '';
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
