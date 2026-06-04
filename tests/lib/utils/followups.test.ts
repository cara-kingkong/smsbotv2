import { describe, it, expect, vi } from 'vitest';
import { countConsecutiveFollowups } from '../../../src/lib/utils/followups';
import { MessageDirection, ConversationEventType } from '../../../src/lib/types';

/**
 * Builds a mock Supabase client with two query paths:
 *  - from('messages')            → last inbound lookup (.maybeSingle())
 *  - from('conversation_events') → followup_sent count (awaited builder → { count })
 */
function makeDb({
  lastInbound,
  count,
}: {
  lastInbound: { created_at: string } | null;
  count: number | null;
}) {
  const eventsChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    then: (resolve: (v: { count: number | null; error: null }) => unknown) =>
      resolve({ count, error: null }),
  };

  const messagesChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: lastInbound, error: null }),
  };

  const db = {
    from: vi.fn().mockImplementation((table: string) =>
      table === 'messages' ? messagesChain : eventsChain),
  };

  return { db, eventsChain, messagesChain };
}

describe('countConsecutiveFollowups', () => {
  it('counts all follow-ups when the lead has never replied', async () => {
    const { db, eventsChain } = makeDb({ lastInbound: null, count: 3 });

    const result = await countConsecutiveFollowups(db as never, 'conv-1');

    expect(result).toBe(3);
    // No inbound message → no created_at filter applied
    expect(eventsChain.gt).not.toHaveBeenCalled();
    expect(eventsChain.eq).toHaveBeenCalledWith('event_type', ConversationEventType.FollowupSent);
  });

  it('counts only follow-ups since the last inbound message', async () => {
    const lastReplyAt = new Date('2026-06-01T00:00:00.000Z').toISOString();
    const { db, eventsChain, messagesChain } = makeDb({
      lastInbound: { created_at: lastReplyAt },
      count: 2,
    });

    const result = await countConsecutiveFollowups(db as never, 'conv-1');

    expect(result).toBe(2);
    // Restricts the count to events after the lead's most recent inbound
    expect(eventsChain.gt).toHaveBeenCalledWith('created_at', lastReplyAt);
    expect(messagesChain.eq).toHaveBeenCalledWith('direction', MessageDirection.Inbound);
  });

  it('treats a null count as zero', async () => {
    const { db } = makeDb({ lastInbound: null, count: null });

    const result = await countConsecutiveFollowups(db as never, 'conv-1');

    expect(result).toBe(0);
  });
});
