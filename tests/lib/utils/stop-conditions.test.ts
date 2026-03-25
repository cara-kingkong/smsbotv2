import { describe, it, expect, vi } from 'vitest';
import { evaluateStopConditions } from '../../../src/lib/utils/stop-conditions';
import type { Conversation, StopConditions } from '../../../src/lib/types';
import { ConversationStatus, MessageDirection, SenderType } from '../../../src/lib/types';

function createMockDb(overrides?: {
  singleData?: unknown;
  listData?: unknown[];
}) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: overrides?.singleData ?? null, error: null }),
  };

  // When chain is used without .single() (the messages list query), resolve with data array
  // We handle this by making the chain itself thenable for the list case
  let callCount = 0;
  const originalLimit = chain.limit;
  chain.limit = vi.fn().mockImplementation(() => {
    callCount++;
    // The second .from('messages') call (list query) doesn't call .single()
    return {
      ...chain,
      limit: chain.limit,
      single: chain.single,
      then: (resolve: (val: { data: unknown; error: null }) => void) => {
        resolve({ data: overrides?.listData ?? [], error: null });
      },
    };
  });

  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-1',
    workspace_id: 'ws-1',
    campaign_id: 'camp-1',
    agent_id: 'agent-1',
    agent_version_id: 'av-1',
    lead_id: 'lead-1',
    status: ConversationStatus.Active,
    outcome: null,
    needs_human: false,
    human_controlled: false,
    opened_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    paused_until: null,
    closed_at: null,
    deleted_at: null,
    ...overrides,
  };
}

const defaultStopConditions: StopConditions = {
  max_messages: 5,
  max_days: 14,
  max_no_reply_hours: 48,
};

describe('evaluateStopConditions', () => {
  it('returns should_stop: false when all conditions are within limits', async () => {
    const conversation = makeConversation({ opened_at: new Date().toISOString() });
    const db = createMockDb({
      singleData: { created_at: new Date().toISOString() },
      listData: [
        { direction: MessageDirection.Outbound, sender_type: SenderType.AI },
        { direction: MessageDirection.Inbound, sender_type: SenderType.Lead },
      ],
    });

    const result = await evaluateStopConditions(db as any, conversation, defaultStopConditions);
    expect(result.should_stop).toBe(false);
    expect(result.reason).toBeNull();
  });

  it('returns should_stop: true when max_days is exceeded', async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const conversation = makeConversation({ opened_at: thirtyDaysAgo });
    const db = createMockDb();

    const result = await evaluateStopConditions(db as any, conversation, defaultStopConditions);
    expect(result.should_stop).toBe(true);
    expect(result.reason).toContain('max duration');
    expect(result.reason).toContain('14');
  });

  it('returns should_stop: true when max_no_reply_hours is exceeded', async () => {
    const conversation = makeConversation({ opened_at: new Date().toISOString() });
    const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

    // Build a mock where the first from('messages') query (single) returns the old inbound
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { created_at: threeDaysAgo },
        error: null,
      }),
    };
    const db = { from: vi.fn().mockReturnValue(chain) };

    const result = await evaluateStopConditions(db as any, conversation, defaultStopConditions);
    expect(result.should_stop).toBe(true);
    expect(result.reason).toContain('No reply');
  });

  it('returns should_stop: true when consecutive outbound messages exceed max_messages', async () => {
    const conversation = makeConversation({ opened_at: new Date().toISOString() });

    // First query (lastInbound single) returns null — no inbound messages
    // Second query (messages list) returns 5 consecutive outbound AI messages
    const outboundMessages = Array.from({ length: 5 }, () => ({
      direction: MessageDirection.Outbound,
      sender_type: SenderType.AI,
    }));

    let queryIndex = 0;
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    };

    const db = {
      from: vi.fn().mockImplementation(() => {
        queryIndex++;
        if (queryIndex === 1) {
          // First call: lastInbound query (uses .single())
          return chain;
        }
        // Second call: messages list query (no .single(), returns array)
        const listChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: outboundMessages, error: null }),
        };
        return listChain;
      }),
    };

    const result = await evaluateStopConditions(db as any, conversation, defaultStopConditions);
    expect(result.should_stop).toBe(true);
    expect(result.reason).toContain('max outbound messages');
  });
});
