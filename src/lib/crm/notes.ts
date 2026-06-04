import type { SupabaseClient } from '@supabase/supabase-js';
import type { AIProviderAdapter } from '@lib/types';
import { MessageDirection, SenderType } from '@lib/types';
import { OpenAIAdapter } from '@lib/ai/adapters/openai';
import { AnthropicAdapter } from '@lib/ai/adapters/anthropic';

export interface ConversationNoteContext {
  /** Headline shown at the top of the note — e.g. "Lead QUALIFIED via SMS chatbot". */
  headline: string;
  /** Optional one-line outcome the caller wants surfaced (e.g. campaign name). */
  subheading?: string;
}

/**
 * Build a CRM note body that captures the conversation details so a sales rep
 * has full context when they open the contact in the CRM. Includes:
 *
 *   - the caller-supplied headline + optional subheading
 *   - the AI's latest qualification reasoning (when present)
 *   - the full SMS transcript with sender labels and timestamps
 *
 * Returns plain text (not Markdown) — Keap and most CRMs render notes as
 * preformatted text in the contact timeline.
 */
export async function buildConversationNote(
  db: SupabaseClient,
  conversationId: string,
  context: ConversationNoteContext,
): Promise<string> {
  const [messagesResult, decisionResult] = await Promise.all([
    db
      .from('messages')
      .select('direction, sender_type, body_text, sent_at, received_at, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true }),
    db
      .from('ai_decisions')
      .select('decision_json, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const messages = (messagesResult.data ?? []) as Array<{
    direction: string;
    sender_type: string;
    body_text: string;
    sent_at: string | null;
    received_at: string | null;
    created_at: string;
  }>;
  const decision = (decisionResult.data?.decision_json ?? {}) as Record<string, unknown>;

  const lines: string[] = [];
  lines.push(context.headline);
  if (context.subheading) lines.push(context.subheading);

  const reasonSummary = typeof decision.reason_summary === 'string' ? decision.reason_summary.trim() : '';
  if (reasonSummary) {
    lines.push('');
    lines.push(`AI assessment: ${reasonSummary}`);
  }

  const qualificationState = typeof decision.qualification_state === 'string' ? decision.qualification_state : '';
  if (qualificationState) {
    lines.push(`Qualification state: ${qualificationState}`);
  }

  // Build the transcript first so we can both summarize it and append it.
  const transcriptLines: string[] = [];
  if (messages.length === 0) {
    transcriptLines.push('(No messages were exchanged.)');
  } else {
    for (const msg of messages) {
      const timestamp = msg.sent_at || msg.received_at || msg.created_at;
      const ts = new Date(timestamp).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
      const sender = labelForSender(msg.direction, msg.sender_type);
      // Indent multi-line bodies so the sender label stays visually anchored.
      const body = msg.body_text?.replace(/\n/g, '\n    ') ?? '';
      transcriptLines.push(`[${ts}] ${sender}: ${body}`);
    }
  }

  // Summarize the customer's situation (revenue, marketing budget, goals, etc.)
  // and surface it ABOVE the transcript so a sales rep gets the gist at a glance.
  // Best-effort: if no AI key is configured or the call fails, we simply omit the
  // section — the note (and full transcript) still goes out.
  if (messages.length > 0) {
    const summary = await summarizeSituation(transcriptLines.join('\n'));
    if (summary) {
      lines.push('');
      lines.push('--- Customer situation ---');
      lines.push(summary);
    }
  }

  lines.push('');
  lines.push('--- Conversation transcript ---');
  for (const line of transcriptLines) lines.push(line);

  return lines.join('\n');
}

/**
 * Generate a short summary of the lead's situation from the transcript using a
 * cheap model. Returns an empty string (so the caller skips the section) when no
 * AI provider is configured or the call fails — never throws.
 */
async function summarizeSituation(transcript: string): Promise<string> {
  const adapter = buildSummarizerAdapter();
  if (!adapter?.summarizeSituation) return '';
  try {
    return (await adapter.summarizeSituation(transcript)).trim();
  } catch (err) {
    console.warn('Situation summary failed; omitting from CRM note:', err);
    return '';
  }
}

/** Pick whichever AI provider has credentials, preferring OpenAI (the default). */
function buildSummarizerAdapter(): AIProviderAdapter | null {
  if (process.env.OPENAI_API_KEY) return new OpenAIAdapter(process.env.OPENAI_API_KEY);
  if (process.env.ANTHROPIC_API_KEY) return new AnthropicAdapter(process.env.ANTHROPIC_API_KEY);
  return null;
}

function labelForSender(direction: string, senderType: string): string {
  if (direction === MessageDirection.Inbound) return 'Lead';
  if (senderType === SenderType.AI) return 'AI';
  if (senderType === SenderType.Human) return 'Human';
  if (senderType === SenderType.System) return 'System';
  return senderType || 'Unknown';
}
