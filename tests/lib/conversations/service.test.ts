import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationService } from '../../../src/lib/conversations/service';
import { ConversationStatus, ConversationEventType } from '../../../src/lib/types';
import type { Conversation } from '../../../src/lib/types';

function createMockDb() {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
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
    status: ConversationStatus.Queued,
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

describe('ConversationService', () => {
  describe('create', () => {
    it('inserts a conversation and logs a Created event', async () => {
      const created = makeConversation();
      const insertCalls: { table: string; data: unknown }[] = [];

      let fromCallCount = 0;
      const db = {
        from: vi.fn().mockImplementation((table: string) => {
          fromCallCount++;
          if (table === 'conversations') {
            return {
              insert: vi.fn().mockImplementation((data: unknown) => {
                insertCalls.push({ table, data });
                return {
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: created, error: null }),
                  }),
                };
              }),
            };
          }
          // conversation_events
          return {
            insert: vi.fn().mockImplementation((data: unknown) => {
              insertCalls.push({ table, data });
              return Promise.resolve({ data: null, error: null });
            }),
          };
        }),
      };

      const service = new ConversationService(db as any);
      const result = await service.create({
        workspace_id: 'ws-1',
        campaign_id: 'camp-1',
        agent_id: 'agent-1',
        agent_version_id: 'av-1',
        lead_id: 'lead-1',
      });

      expect(result).toEqual(created);
      expect(result.status).toBe(ConversationStatus.Queued);
      // Verify event was logged
      expect(insertCalls.length).toBe(2);
      expect(insertCalls[1].table).toBe('conversation_events');
      const eventData = insertCalls[1].data as Record<string, unknown>;
      expect(eventData.event_type).toBe(ConversationEventType.Created);
      expect(eventData.conversation_id).toBe('conv-1');
    });

    it('throws when insert fails', async () => {
      const db = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'unique constraint violated' },
              }),
            }),
          }),
        }),
      };

      const service = new ConversationService(db as any);
      await expect(
        service.create({
          workspace_id: 'ws-1',
          campaign_id: 'camp-1',
          agent_id: 'agent-1',
          agent_version_id: 'av-1',
          lead_id: 'lead-1',
        }),
      ).rejects.toThrow('Failed to create conversation');
    });
  });

  describe('getActiveForLead', () => {
    it('returns null when no active conversations exist', async () => {
      const db = createMockDb();
      db._chain.single.mockResolvedValue({ data: null, error: { message: 'not found' } });

      const service = new ConversationService(db as any);
      const result = await service.getActiveForLead('lead-1');

      expect(result).toBeNull();
      expect(db.from).toHaveBeenCalledWith('conversations');
    });

    it('returns the active conversation when one exists', async () => {
      const conversation = makeConversation({ status: ConversationStatus.Active });
      const db = createMockDb();
      db._chain.single.mockResolvedValue({ data: conversation, error: null });

      const service = new ConversationService(db as any);
      const result = await service.getActiveForLead('lead-1');

      expect(result).toEqual(conversation);
    });
  });

  describe('humanTakeover', () => {
    it('sets human_controlled and logs HumanTakeover event', async () => {
      const updated = makeConversation({
        human_controlled: true,
        needs_human: false,
        status: ConversationStatus.HumanControlled,
      });

      const insertedEvents: unknown[] = [];
      let fromCallCount = 0;
      const db = {
        from: vi.fn().mockImplementation((table: string) => {
          fromCallCount++;
          if (table === 'conversations') {
            return {
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: updated, error: null }),
                  }),
                }),
              }),
            };
          }
          // conversation_events
          return {
            insert: vi.fn().mockImplementation((data: unknown) => {
              insertedEvents.push(data);
              return Promise.resolve({ data: null, error: null });
            }),
          };
        }),
      };

      const service = new ConversationService(db as any);
      const result = await service.humanTakeover('conv-1');

      expect(result.human_controlled).toBe(true);
      expect(result.status).toBe(ConversationStatus.HumanControlled);
      expect(insertedEvents.length).toBe(1);
      expect((insertedEvents[0] as Record<string, unknown>).event_type).toBe(
        ConversationEventType.HumanTakeover,
      );
    });
  });

  describe('releaseToAI', () => {
    it('clears human_controlled and sets Active status', async () => {
      const updated = makeConversation({
        human_controlled: false,
        status: ConversationStatus.Active,
      });

      const insertedEvents: unknown[] = [];
      const db = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'conversations') {
            return {
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({ data: updated, error: null }),
                  }),
                }),
              }),
            };
          }
          return {
            insert: vi.fn().mockImplementation((data: unknown) => {
              insertedEvents.push(data);
              return Promise.resolve({ data: null, error: null });
            }),
          };
        }),
      };

      const service = new ConversationService(db as any);
      const result = await service.releaseToAI('conv-1');

      expect(result.human_controlled).toBe(false);
      expect(result.status).toBe(ConversationStatus.Active);
      expect(insertedEvents.length).toBe(1);
      expect((insertedEvents[0] as Record<string, unknown>).event_type).toBe(
        ConversationEventType.HumanRelease,
      );
    });
  });

  describe('updateStatus', () => {
    it('sets closed_at for terminal statuses (Completed)', async () => {
      const updated = makeConversation({
        status: ConversationStatus.Completed,
        closed_at: new Date().toISOString(),
      });

      let updatePayload: Record<string, unknown> = {};
      const db = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockImplementation((data: Record<string, unknown>) => {
            updatePayload = data;
            return {
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: updated, error: null }),
                }),
              }),
            };
          }),
        }),
      };

      const service = new ConversationService(db as any);
      const result = await service.updateStatus('conv-1', ConversationStatus.Completed);

      expect(result.status).toBe(ConversationStatus.Completed);
      expect(updatePayload.closed_at).toBeDefined();
      expect(updatePayload.status).toBe(ConversationStatus.Completed);
    });

    it('sets closed_at for OptedOut status', async () => {
      const updated = makeConversation({
        status: ConversationStatus.OptedOut,
        closed_at: new Date().toISOString(),
      });

      let updatePayload: Record<string, unknown> = {};
      const db = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockImplementation((data: Record<string, unknown>) => {
            updatePayload = data;
            return {
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: updated, error: null }),
                }),
              }),
            };
          }),
        }),
      };

      const service = new ConversationService(db as any);
      await service.updateStatus('conv-1', ConversationStatus.OptedOut);

      expect(updatePayload.closed_at).toBeDefined();
    });

    it('does not set closed_at for non-terminal statuses (Active)', async () => {
      const updated = makeConversation({ status: ConversationStatus.Active });

      let updatePayload: Record<string, unknown> = {};
      const db = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockImplementation((data: Record<string, unknown>) => {
            updatePayload = data;
            return {
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: updated, error: null }),
                }),
              }),
            };
          }),
        }),
      };

      const service = new ConversationService(db as any);
      await service.updateStatus('conv-1', ConversationStatus.Active);

      expect(updatePayload.closed_at).toBeUndefined();
      expect(updatePayload.status).toBe(ConversationStatus.Active);
    });
  });
});
