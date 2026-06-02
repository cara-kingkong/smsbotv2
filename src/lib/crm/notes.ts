import type { SupabaseClient } from '@supabase/supabase-js';
import { MessageDirection, SenderType } from '@lib/types';

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

  lines.push('');
  lines.push('--- Conversation transcript ---');

  if (messages.length === 0) {
    lines.push('(No messages were exchanged.)');
  } else {
    for (const msg of messages) {
      const timestamp = msg.sent_at || msg.received_at || msg.created_at;
      const ts = new Date(timestamp).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
      const sender = labelForSender(msg.direction, msg.sender_type);
      // Indent multi-line bodies so the sender label stays visually anchored.
      const body = msg.body_text?.replace(/\n/g, '\n    ') ?? '';
      lines.push(`[${ts}] ${sender}: ${body}`);
    }
  }

  return lines.join('\n');
}

function labelForSender(direction: string, senderType: string): string {
  if (direction === MessageDirection.Inbound) return 'Lead';
  if (senderType === SenderType.AI) return 'AI';
  if (senderType === SenderType.Human) return 'Human';
  if (senderType === SenderType.System) return 'System';
  return senderType || 'Unknown';
}
