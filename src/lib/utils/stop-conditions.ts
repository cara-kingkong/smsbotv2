import type { SupabaseClient } from '@supabase/supabase-js';
import type { StopConditions, Conversation } from '@lib/types';
import { MessageDirection, SenderType } from '@lib/types';

export interface StopConditionResult {
  should_stop: boolean;
  reason: string | null;
}

/**
 * Evaluate stop conditions for a conversation.
 * Returns whether the conversation should be auto-completed.
 */
export async function evaluateStopConditions(
  db: SupabaseClient,
  conversation: Conversation,
  stopConditions: StopConditions,
): Promise<StopConditionResult> {
  // Check max days
  const conversationAge = Date.now() - new Date(conversation.opened_at).getTime();
  const maxDaysMs = stopConditions.max_days * 24 * 60 * 60 * 1000;
  if (conversationAge > maxDaysMs) {
    return { should_stop: true, reason: `Conversation exceeded max duration of ${stopConditions.max_days} days` };
  }

  // Check max no-reply hours (time since last inbound message)
  const { data: lastInbound } = await db
    .from('messages')
    .select('created_at')
    .eq('conversation_id', conversation.id)
    .eq('direction', MessageDirection.Inbound)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (lastInbound) {
    const hoursSinceReply = (Date.now() - new Date(lastInbound.created_at).getTime()) / (1000 * 60 * 60);
    if (hoursSinceReply > stopConditions.max_no_reply_hours) {
      return { should_stop: true, reason: `No reply for ${Math.round(hoursSinceReply)} hours (max: ${stopConditions.max_no_reply_hours})` };
    }
  }

  // Check max outbound messages without reply
  const { data: messages } = await db
    .from('messages')
    .select('direction, sender_type')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (messages) {
    let consecutiveOutbound = 0;
    for (const msg of messages) {
      if (msg.direction === MessageDirection.Outbound && msg.sender_type === SenderType.AI) {
        consecutiveOutbound++;
      } else if (msg.direction === MessageDirection.Inbound) {
        break;
      }
    }
    if (consecutiveOutbound >= stopConditions.max_messages) {
      return { should_stop: true, reason: `Reached max outbound messages without reply (${stopConditions.max_messages})` };
    }
  }

  return { should_stop: false, reason: null };
}
