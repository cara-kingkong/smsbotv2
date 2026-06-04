import type { SupabaseClient } from '@supabase/supabase-js';
import type { AIProviderAdapter, AIPromptContext, AIDecision, AgentVersion, Message, Lead } from '@lib/types';
import { QualificationState, MessageDirection } from '@lib/types';
import { detectReaction } from '@lib/utils/reaction';

export class AIService {
  constructor(
    private readonly db: SupabaseClient,
    private readonly providerAdapters: Map<string, AIProviderAdapter>,
  ) {}

  /** Build prompt context and generate a structured AI decision */
  async generateReply(input: {
    agent_version: AgentVersion;
    conversation_history: Message[];
    lead: Lead;
    available_calendar_ids: string[];
    available_calendars?: Array<{ id: string; name: string }>;
    available_slots?: string[];
    provider_key: string;
  }): Promise<AIDecision> {
    const adapter = this.providerAdapters.get(input.provider_key);
    if (!adapter) throw new Error(`No AI adapter for provider: ${input.provider_key}`);

    const config = (input.agent_version.config_json ?? {}) as Record<string, unknown>;
    const model = typeof config.model === 'string' && config.model ? config.model : undefined;
    const temperature = typeof config.temperature === 'number' ? config.temperature : undefined;

    const context: AIPromptContext = {
      system_prompt: input.agent_version.prompt_text,
      model,
      temperature,
      conversation_history: input.conversation_history.map((m) => ({
        direction: m.direction,
        sender_type: m.sender_type,
        body_text: m.body_text,
      })),
      lead: {
        first_name: input.lead.first_name,
        last_name: input.lead.last_name,
        timezone: input.lead.timezone,
      },
      available_calendar_ids: input.available_calendar_ids,
      available_calendars: input.available_calendars ?? input.available_calendar_ids.map((id) => ({ id, name: id })),
      available_slots: input.available_slots,
    };

    // Flag when the lead's latest inbound is an emoji reaction / tapback so the
    // model can decide whether replying is natural (usually it isn't).
    const latestInbound = [...input.conversation_history]
      .reverse()
      .find((m) => m.direction === MessageDirection.Inbound);
    if (latestInbound) {
      const reaction = detectReaction(latestInbound.body_text);
      if (reaction) context.latest_inbound_reaction = reaction;
    }

    const decision = await adapter.generateReply(context);

    // Validate decision shape — fallback for safety
    const validated = this.validateDecision(decision);

    if (validated.should_book && !validated.recommended_calendar_id && input.available_calendar_ids.length > 0) {
      validated.recommended_calendar_id = input.available_calendar_ids[0];
      validated.confidence_notes = [
        ...validated.confidence_notes,
        `Filled recommended_calendar_id from ${input.available_calendar_ids.length === 1 ? 'sole' : 'first'} available calendar`,
      ];
    }

    return validated;
  }

  /**
   * Produce the first outbound SMS from a semi-static opening message.
   * Always substitutes merge fields ({{first_name}} etc). If `model` is a real
   * model id, a cheap LLM lightly personalizes the result; otherwise ('static'
   * or unset) the substituted template is returned verbatim — zero cost.
   */
  async generateOpeningMessage(input: {
    template: string;
    lead: Pick<Lead, 'first_name' | 'last_name'>;
    model: string;
    /** Short reason-for-outreach so prompt-style openers can pick the right variant. */
    context?: string;
  }): Promise<string> {
    const draft = substituteMergeFields(input.template, input.lead);

    const model = (input.model ?? '').trim();
    if (!model || model === 'static') return draft;

    const providerKey = model.startsWith('claude') ? 'anthropic' : 'openai';
    const adapter = this.providerAdapters.get(providerKey);
    if (!adapter?.generateOpening) return draft;

    try {
      const personalized = await adapter.generateOpening({
        message: draft,
        first_name: input.lead.first_name,
        context: input.context,
        model,
      });
      return personalized.trim() || draft;
    } catch {
      // Never let a personalization failure block the first message.
      return draft;
    }
  }

  private validateDecision(raw: AIDecision): AIDecision {
    return {
      should_reply: typeof raw.should_reply === 'boolean' ? raw.should_reply : true,
      reply_text: typeof raw.reply_text === 'string' ? raw.reply_text : '',
      qualification_state: Object.values(QualificationState).includes(raw.qualification_state)
        ? raw.qualification_state
        : QualificationState.Unknown,
      should_offer_times: typeof raw.should_offer_times === 'boolean' ? raw.should_offer_times : false,
      offer_outside_business_hours: typeof raw.offer_outside_business_hours === 'boolean' ? raw.offer_outside_business_hours : false,
      should_book: typeof raw.should_book === 'boolean' ? raw.should_book : false,
      should_cancel_booking: typeof raw.should_cancel_booking === 'boolean' ? raw.should_cancel_booking : false,
      confirmed_time: typeof raw.confirmed_time === 'string' ? raw.confirmed_time : null,
      recommended_calendar_id: raw.recommended_calendar_id ?? null,
      escalate_to_human: typeof raw.escalate_to_human === 'boolean' ? raw.escalate_to_human : false,
      tags_to_emit: Array.isArray(raw.tags_to_emit) ? raw.tags_to_emit : [],
      confidence_notes: Array.isArray(raw.confidence_notes) ? raw.confidence_notes : [],
      reason_summary: typeof raw.reason_summary === 'string' ? raw.reason_summary : '',
    };
  }
}

/** Replace {{first_name}}, {{last_name}}, {{name}} merge fields (case-insensitive, spaces tolerated). */
function substituteMergeFields(template: string, lead: Pick<Lead, 'first_name' | 'last_name'>): string {
  const firstName = lead.first_name?.trim() ?? '';
  const lastName = lead.last_name?.trim() ?? '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ');

  const values: Record<string, string> = {
    first_name: firstName || 'there',
    last_name: lastName,
    name: fullName || firstName || 'there',
    full_name: fullName || firstName || 'there',
  };

  return template
    .replace(/\{\{\s*(first_name|last_name|full_name|name)\s*\}\}/gi, (_match, key: string) => values[key.toLowerCase()] ?? '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
