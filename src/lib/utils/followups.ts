import type { SupabaseClient } from '@supabase/supabase-js';
import { MessageDirection, ConversationEventType } from '@lib/types';

/**
 * Count the number of unprompted follow-ups ("nudges") sent to a lead since
 * their most recent inbound message.
 *
 * This is what `max_followups` is meant to cap: consecutive nudges to a SILENT
 * lead. We count `followup_sent` events created after the lead's last inbound
 * message, so a genuine back-and-forth doesn't consume the follow-up budget and
 * each new silence resets it. If the lead has never replied (e.g. AI-initiated
 * outreach), every follow-up sent so far counts.
 */
export async function countConsecutiveFollowups(
  db: SupabaseClient,
  conversationId: string,
): Promise<number> {
  const { data: lastInbound } = await db
    .from('messages')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .eq('direction', MessageDirection.Inbound)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let query = db
    .from('conversation_events')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('event_type', ConversationEventType.FollowupSent);

  if (lastInbound?.created_at) {
    query = query.gt('created_at', lastInbound.created_at);
  }

  const { count } = await query;
  return count ?? 0;
}
