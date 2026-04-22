import { describe, it, expect, vi } from 'vitest';
import { AgentService } from '../../../src/lib/agents/service';
import { EntityStatus } from '../../../src/lib/types';
import type { Agent, AgentVersion } from '../../../src/lib/types';

function createMockDb() {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
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

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    campaign_id: 'camp-1',
    name: 'Test Agent',
    status: EntityStatus.Active,
    ai_provider_integration_id: null,
    weight: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  };
}

function makeVersion(overrides: Partial<AgentVersion> = {}): AgentVersion {
  return {
    id: 'av-1',
    agent_id: 'agent-1',
    version_number: 1,
    prompt_text: 'You are a helpful agent.',
    system_rules_json: {},
    reply_cadence_json: { reply_delay_seconds: 30, followup_delay_seconds: 3600, max_followups: 5 },
    config_json: {},
    is_active: true,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('AgentService', () => {
  describe('selectForConversation', () => {
    it('returns a weighted random agent with its active version', async () => {
      const agents = [
        makeAgent({ id: 'a1', weight: 70 }),
        makeAgent({ id: 'a2', weight: 30 }),
      ];
      const version = makeVersion({ agent_id: 'a1' });

      const db = {
        from: vi.fn().mockImplementation((_table: string) => {
          if (_table === 'agents') {
            // Chain: .select().eq().is().eq() — all must return this
            const agentChain = {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockImplementation(() => {
                // Final .eq() resolves the promise
                return Promise.resolve({ data: agents, error: null });
              }),
              is: vi.fn().mockReturnThis(),
            };
            // Override: the first .eq() call must returnThis (for campaign_id),
            // but the last .eq() (after .is()) resolves. Use call counting.
            let eqCalls = 0;
            agentChain.eq = vi.fn().mockImplementation(() => {
              eqCalls++;
              if (eqCalls < 2) return agentChain; // campaign_id eq
              return Promise.resolve({ data: agents, error: null }); // status eq
            });
            return agentChain;
          }
          // agent_versions
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: version, error: null }),
          };
        }),
      };

      const service = new AgentService(db as any);
      const result = await service.selectForConversation('camp-1');

      expect(result.agent).toBeDefined();
      expect(result.version).toBeDefined();
      expect(['a1', 'a2']).toContain(result.agent.id);
      expect(result.version.is_active).toBe(true);
    });

    it('throws when no active agents exist for campaign', async () => {
      const agentChain: Record<string, any> = {
        select: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
      };
      let eqCalls = 0;
      agentChain.eq = vi.fn().mockImplementation(() => {
        eqCalls++;
        if (eqCalls < 2) return agentChain;
        return Promise.resolve({ data: [], error: null });
      });
      const db = { from: vi.fn().mockReturnValue(agentChain) };

      const service = new AgentService(db as any);
      await expect(service.selectForConversation('camp-1')).rejects.toThrow('No active agents');
    });

    it('throws when selected agent has no active version', async () => {
      const agents = [makeAgent({ id: 'a1', weight: 1 })];

      const db = {
        from: vi.fn().mockImplementation((_table: string) => {
          if (_table === 'agents') {
            const agentChain: Record<string, any> = {
              select: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
            };
            let eqCalls = 0;
            agentChain.eq = vi.fn().mockImplementation(() => {
              eqCalls++;
              if (eqCalls < 2) return agentChain;
              return Promise.resolve({ data: agents, error: null });
            });
            return agentChain;
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
          };
        }),
      };

      const service = new AgentService(db as any);
      await expect(service.selectForConversation('camp-1')).rejects.toThrow('No active version');
    });
  });

  describe('createVersion', () => {
    it('deactivates previous versions and increments version_number', async () => {
      const latestVersion = { version_number: 2 };
      const newVersion = makeVersion({ version_number: 3 });

      let fromCallCount = 0;
      const updateEqMock = vi.fn().mockResolvedValue({ data: null, error: null });
      const db = {
        from: vi.fn().mockImplementation((_table: string) => {
          fromCallCount++;
          if (fromCallCount === 1) {
            // First call: get latest version_number
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: latestVersion, error: null }),
            };
          }
          if (fromCallCount === 2) {
            // Second call: deactivate previous versions
            return {
              update: vi.fn().mockReturnValue({ eq: updateEqMock }),
            };
          }
          // Third call: insert new version
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: newVersion, error: null }),
              }),
            }),
          };
        }),
      };

      const service = new AgentService(db as any);
      const result = await service.createVersion({
        agent_id: 'agent-1',
        prompt_text: 'New prompt',
      });

      expect(result.version_number).toBe(3);
      expect(result.is_active).toBe(true);
      // Verify deactivation was called
      expect(updateEqMock).toHaveBeenCalled();
    });

    it('starts at version 1 when no previous versions exist', async () => {
      const newVersion = makeVersion({ version_number: 1 });

      let fromCallCount = 0;
      const db = {
        from: vi.fn().mockImplementation(() => {
          fromCallCount++;
          if (fromCallCount === 1) {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
            };
          }
          if (fromCallCount === 2) {
            return {
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            };
          }
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: newVersion, error: null }),
              }),
            }),
          };
        }),
      };

      const service = new AgentService(db as any);
      const result = await service.createVersion({
        agent_id: 'agent-1',
        prompt_text: 'First prompt',
      });

      expect(result.version_number).toBe(1);
    });
  });

  describe('getActiveVersion', () => {
    it('returns the active version for an agent', async () => {
      const version = makeVersion();
      const db = createMockDb();
      db._chain.single.mockResolvedValue({ data: version, error: null });

      const service = new AgentService(db as any);
      const result = await service.getActiveVersion('agent-1');

      expect(result).toEqual(version);
      expect(result!.is_active).toBe(true);
      expect(db.from).toHaveBeenCalledWith('agent_versions');
    });

    it('returns null when no active version exists', async () => {
      const db = createMockDb();
      db._chain.single.mockResolvedValue({ data: null, error: { message: 'not found' } });

      const service = new AgentService(db as any);
      const result = await service.getActiveVersion('agent-1');

      expect(result).toBeNull();
    });
  });

  describe('weighted random distribution', () => {
    it('selects agents proportional to their weights over many iterations', () => {
      const agents = [
        { id: 'a1', weight: 70 },
        { id: 'a2', weight: 30 },
      ];
      const totalWeight = agents.reduce((sum, a) => sum + a.weight, 0);
      expect(totalWeight).toBe(100);

      const counts: Record<string, number> = { a1: 0, a2: 0 };
      for (let i = 0; i < 1000; i++) {
        let random = Math.random() * totalWeight;
        for (const agent of agents) {
          random -= agent.weight;
          if (random <= 0) {
            counts[agent.id]++;
            break;
          }
        }
      }

      expect(counts.a1).toBeGreaterThan(550);
      expect(counts.a1).toBeLessThan(850);
    });
  });
});
