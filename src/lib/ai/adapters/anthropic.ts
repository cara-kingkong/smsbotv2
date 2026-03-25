import Anthropic from '@anthropic-ai/sdk';
import type { AIProviderAdapter, AIPromptContext, AIDecision } from '@lib/types';
import { QualificationState } from '@lib/types';

const DECISION_SCHEMA = `
You must respond with ONLY valid JSON matching this schema (no other text):
{
  "should_reply": boolean,
  "reply_text": string,
  "qualification_state": "unknown" | "exploring" | "qualified" | "unqualified" | "needs_more_info",
  "should_book": boolean,
  "recommended_calendar_id": string | null,
  "escalate_to_human": boolean,
  "tags_to_emit": string[],
  "confidence_notes": string[],
  "reason_summary": string
}
`;

export class AnthropicAdapter implements AIProviderAdapter {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateReply(context: AIPromptContext): Promise<AIDecision> {
    const systemPrompt = [
      context.system_prompt,
      '',
      'Available calendar IDs: ' + (context.available_calendar_ids.join(', ') || 'none'),
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
        should_book: false,
        recommended_calendar_id: null,
        escalate_to_human: true,
        tags_to_emit: [],
        confidence_notes: ['Failed to parse structured output'],
        reason_summary: 'Structured output parse failure — escalating',
      };
    }
  }
}
