import OpenAI from 'openai';
import type { AIProviderAdapter, AIPromptContext, AIDecision } from '@lib/types';
import { QualificationState } from '@lib/types';

const DECISION_SCHEMA = `
You must respond with valid JSON matching this schema:
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
          'Available calendar IDs: ' + (context.available_calendar_ids.join(', ') || 'none'),
          '',
          `Lead: ${context.lead.first_name} ${context.lead.last_name ?? ''}`.trim(),
          context.lead.timezone ? `Timezone: ${context.lead.timezone}` : '',
          '',
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

    const completion = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.7,
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
