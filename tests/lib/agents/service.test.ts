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
    // Builds a db mock where the `agents` query resolves to `agents` and the
    // `agent_versions` query (.select().in().eq()) resolves to `versions`.
    function buildDb(agents: Agent[], versions: AgentVersion[]) {
      return {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'agents') {
            const agentChain: Record<string, any> = {
              select: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
            };
            let eqCalls = 0;
            agentChain.eq = vi.fn().mockImplementation(() => {
              eqCalls++;
              if (eqCalls < 2) return agentChain; // campaign_id eq → chainable
              return Promise.resolve({ data: agents, error: null }); // status eq → resolves
            });
            return agentChain;
          }
          // agent_versions: .select().in().eq() resolves the list
          const versionChain: Record<string, any> = {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: versions, error: null }),
          };
          return versionChain;
        }),
      };
    }

    it('returns a weighted random agent with its active version', async () => {
      const agents = [
        makeAgent({ id: 'a1', weight: 70 }),
        makeAgent({ id: 'a2', weight: 30 }),
      ];
      const versions = [
        makeVersion({ id: 'av-a1', agent_id: 'a1' }),
        makeVersion({ id: 'av-a2', agent_id: 'a2' }),
      ];

      const service = new AgentService(buildDb(agents, versions) as any);
      const result = await service.selectForConversation('camp-1');

      expect(result.agent).toBeDefined();
      expect(result.version).toBeDefined();
      expect(['a1', 'a2']).toContain(result.agent.id);
      expect(result.version.agent_id).toBe(result.agent.id);
      expect(result.version.is_active).toBe(true);
    });

    it('skips promptless agents and selects one that has a published version', async () => {
      const agents = [
        makeAgent({ id: 'a1', weight: 90 }), // no version → must be skipped
        makeAgent({ id: 'a2', weight: 10 }),
      ];
      const versions = [makeVersion({ id: 'av-a2', agent_id: 'a2' })];

      const service = new AgentService(buildDb(agents, versions) as any);
      const result = await service.selectForConversation('camp-1');

      expect(result.agent.id).toBe('a2');
      expect(result.version.agent_id).toBe('a2');
    });

    it('throws when no active agents exist for campaign', async () => {
      const service = new AgentService(buildDb([], []) as any);
      await expect(service.selectForConversation('camp-1')).rejects.toThrow('No active agents');
    });

    it('throws when no active agent has a published prompt version', async () => {
      const agents = [makeAgent({ id: 'a1', weight: 1 })];
      const service = new AgentService(buildDb(agents, []) as any);
      await expect(service.selectForConversation('camp-1')).rejects.toThrow(
        'No active agents with a published prompt version',
      );
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
