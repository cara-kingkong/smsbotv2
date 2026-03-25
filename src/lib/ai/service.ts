import type { SupabaseClient } from '@supabase/supabase-js';
import type { AIProviderAdapter, AIPromptContext, AIDecision, AgentVersion, Message, Lead } from '@lib/types';
import { QualificationState } from '@lib/types';

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
    provider_key: string;
  }): Promise<AIDecision> {
    const adapter = this.providerAdapters.get(input.provider_key);
    if (!adapter) throw new Error(`No AI adapter for provider: ${input.provider_key}`);

    const context: AIPromptContext = {
      system_prompt: input.agent_version.prompt_text,
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
      rules: input.agent_version.system_rules_json,
    };

    const decision = await adapter.generateReply(context);

    // Validate decision shape — fallback for safety
    return this.validateDecision(decision);
  }

  private validateDecision(raw: AIDecision): AIDecision {
    return {
      should_reply: typeof raw.should_reply === 'boolean' ? raw.should_reply : true,
      reply_text: typeof raw.reply_text === 'string' ? raw.reply_text : '',
      qualification_state: Object.values(QualificationState).includes(raw.qualification_state)
        ? raw.qualification_state
        : QualificationState.Unknown,
      should_book: typeof raw.should_book === 'boolean' ? raw.should_book : false,
      recommended_calendar_id: raw.recommended_calendar_id ?? null,
      escalate_to_human: typeof raw.escalate_to_human === 'boolean' ? raw.escalate_to_human : false,
      tags_to_emit: Array.isArray(raw.tags_to_emit) ? raw.tags_to_emit : [],
      confidence_notes: Array.isArray(raw.confidence_notes) ? raw.confidence_notes : [],
      reason_summary: typeof raw.reason_summary === 'string' ? raw.reason_summary : '',
    };
  }
}
