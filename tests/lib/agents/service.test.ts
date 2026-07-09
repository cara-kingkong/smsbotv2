import { describe, it, expect, vi } from 'vitest';
import { AgentService, AgentServiceError } from '../../../src/lib/agents/service';
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

  describe('duplicateToCampaign', () => {
    const SOURCE_WS = 'ws-source';
    const OTHER_WS = 'ws-other';

    function makeSourceAgent(workspaceId: string): Agent & { campaigns: { workspace_id: string } } {
      return {
        ...makeAgent({ id: 'src-agent', campaign_id: 'src-camp', name: 'Original Agent', weight: 50, description: 'Source desc' }),
        campaigns: { workspace_id: workspaceId },
      };
    }

    const targetCampaign = { id: 'tgt-camp', workspace_id: SOURCE_WS };
    const srcActiveVersion = makeVersion({ id: 'src-av', agent_id: 'src-agent', prompt_text: 'Hello from source' });
    const newAgentResult = makeAgent({ id: 'new-agent', campaign_id: 'tgt-camp', name: 'Original Agent', weight: 50 });
    const newVersionResult = makeVersion({ id: 'new-av', agent_id: 'new-agent' });

    // Builds a mock DB that sequences through the expected call pattern for a full duplication.
    // agentsCallCount: 1=load source, 2=insert new agent (inside create())
    // campaignsCallCount: 1=load target, 2=get workspace_id (inside create())
    // versionsCallCount: 1=getActiveVersion, 2=get latest#, 3=deactivate, 4=insert new version
    function buildDb({
      sourceAgent = makeSourceAgent(SOURCE_WS) as (Agent & { campaigns: { workspace_id: string } }) | null,
      target = targetCampaign as { id: string; workspace_id: string } | null,
      activeVersion = srcActiveVersion as AgentVersion | null,
      newAgent = newAgentResult,
      newVersion = newVersionResult,
    } = {}) {
      let agentsCallCount = 0;
      let campaignsCallCount = 0;
      let versionsCallCount = 0;

      return {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'agents') {
            agentsCallCount++;
            if (agentsCallCount === 1) {
              return {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                is: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({
                  data: sourceAgent,
                  error: sourceAgent ? null : { message: 'not found' },
                }),
              };
            }
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: newAgent, error: null }),
                }),
              }),
            };
          }

          if (table === 'campaigns') {
            campaignsCallCount++;
            if (campaignsCallCount === 1) {
              return {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({
                  data: target,
                  error: target ? null : { message: 'not found' },
                }),
              };
            }
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: { workspace_id: target?.workspace_id },
                error: null,
              }),
            };
          }

          // agent_versions
          versionsCallCount++;
          if (versionsCallCount === 1) {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: activeVersion,
                error: activeVersion ? null : { message: 'not found' },
              }),
            };
          }
          if (versionsCallCount === 2) {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
            };
          }
          if (versionsCallCount === 3) {
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
    }

    it('duplicates agent metadata and active version into the target campaign', async () => {
      const db = buildDb();
      const service = new AgentService(db as any);

      const result = await service.duplicateToCampaign({
        source_agent_id: 'src-agent',
        target_campaign_id: 'tgt-camp',
      });

      expect(result.id).toBe('new-agent');
      expect(result.campaign_id).toBe('tgt-camp');
    });

    it('applies name and weight overrides when provided', async () => {
      const overridden = makeAgent({ id: 'new-agent', campaign_id: 'tgt-camp', name: 'Override Name', weight: 10 });
      const db = buildDb({ newAgent: overridden });
      const service = new AgentService(db as any);

      const result = await service.duplicateToCampaign({
        source_agent_id: 'src-agent',
        target_campaign_id: 'tgt-camp',
        name: 'Override Name',
        weight: 10,
      });

      expect(result.name).toBe('Override Name');
      expect(result.weight).toBe(10);
    });

    it('throws NOT_FOUND when source agent does not exist', async () => {
      const db = buildDb({ sourceAgent: null });
      const service = new AgentService(db as any);

      const err = await service
        .duplicateToCampaign({ source_agent_id: 'missing', target_campaign_id: 'tgt-camp' })
        .catch((e) => e);

      expect(err).toBeInstanceOf(AgentServiceError);
      expect(err.code).toBe('NOT_FOUND');
    });

    it('throws NOT_FOUND when target campaign does not exist', async () => {
      const db = buildDb({ target: null });
      const service = new AgentService(db as any);

      const err = await service
        .duplicateToCampaign({ source_agent_id: 'src-agent', target_campaign_id: 'missing' })
        .catch((e) => e);

      expect(err).toBeInstanceOf(AgentServiceError);
      expect(err.code).toBe('NOT_FOUND');
    });

    it('throws WORKSPACE_MISMATCH when source and target are in different workspaces', async () => {
      const db = buildDb({ target: { id: 'tgt-camp', workspace_id: OTHER_WS } });
      const service = new AgentService(db as any);

      const err = await service
        .duplicateToCampaign({ source_agent_id: 'src-agent', target_campaign_id: 'tgt-camp' })
        .catch((e) => e);

      expect(err).toBeInstanceOf(AgentServiceError);
      expect(err.code).toBe('WORKSPACE_MISMATCH');
    });

    it('throws NO_ACTIVE_VERSION when source agent has no active prompt', async () => {
      const db = buildDb({ activeVersion: null });
      const service = new AgentService(db as any);

      const err = await service
        .duplicateToCampaign({ source_agent_id: 'src-agent', target_campaign_id: 'tgt-camp' })
        .catch((e) => e);

      expect(err).toBeInstanceOf(AgentServiceError);
      expect(err.code).toBe('NO_ACTIVE_VERSION');
    });

    it('inserts the new agent with paused status so it never enters live routing', async () => {
      let capturedInsertRow: Record<string, unknown> | null = null;
      let agentsCount = 0, campaignsCount = 0, versionsCount = 0;

      const source = makeSourceAgent(SOURCE_WS);
      const target = { id: 'tgt', workspace_id: SOURCE_WS };
      const av = makeVersion({ agent_id: 'src-agent' });

      const db = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'agents') {
            agentsCount++;
            if (agentsCount === 1) {
              return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: source, error: null }) };
            }
            return {
              insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
                capturedInsertRow = row;
                return { select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: makeAgent({ id: 'new' }), error: null }) }) };
              }),
            };
          }
          if (table === 'campaigns') {
            campaignsCount++;
            return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: campaignsCount === 1 ? target : { workspace_id: SOURCE_WS }, error: null }) };
          }
          versionsCount++;
          if (versionsCount === 1) return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: av, error: null }) };
          if (versionsCount === 2) return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }) };
          if (versionsCount === 3) return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }) };
          return { insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: makeVersion({ agent_id: 'new' }), error: null }) }) }) };
        }),
      };

      const service = new AgentService(db as any);
      await service.duplicateToCampaign({ source_agent_id: 'src-agent', target_campaign_id: 'tgt' });

      expect(capturedInsertRow?.status).toBe(EntityStatus.Paused);
    });

    it('soft-deletes the new agent if version copy fails to prevent orphans', async () => {
      let rolledBackAgentId: string | null = null;
      let agentsCount = 0, campaignsCount = 0, versionsCount = 0;

      const source = makeSourceAgent(SOURCE_WS);
      const target = { id: 'tgt', workspace_id: SOURCE_WS };
      const av = makeVersion({ agent_id: 'src-agent' });
      const createdAgent = makeAgent({ id: 'orphan-candidate', campaign_id: 'tgt' });

      const db = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'agents') {
            agentsCount++;
            if (agentsCount === 1) {
              return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: source, error: null }) };
            }
            if (agentsCount === 2) {
              return { insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: createdAgent, error: null }) }) }) };
            }
            // agentsCount === 3: rollback update
            return {
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockImplementation((_col: string, val: string) => {
                  rolledBackAgentId = val;
                  return Promise.resolve({ data: null, error: null });
                }),
              }),
            };
          }
          if (table === 'campaigns') {
            campaignsCount++;
            return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: campaignsCount === 1 ? target : { workspace_id: SOURCE_WS }, error: null }) };
          }
          versionsCount++;
          if (versionsCount === 1) return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: av, error: null }) };
          if (versionsCount === 2) return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }) };
          if (versionsCount === 3) return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) }) };
          // versionsCount === 4: version insert fails
          return { insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB write error' } }) }) }) };
        }),
      };

      const service = new AgentService(db as any);
      const err = await service
        .duplicateToCampaign({ source_agent_id: 'src-agent', target_campaign_id: 'tgt' })
        .catch((e) => e);

      expect(err).toBeInstanceOf(Error);
      expect(err.message).toContain('DB write error');
      expect(rolledBackAgentId).toBe('orphan-candidate');
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
