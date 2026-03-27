import type { SupabaseClient } from '@supabase/supabase-js';
import type { Agent, AgentVersion } from '@lib/types';
import { EntityStatus } from '@lib/types';

export interface CreateAgentInput {
  campaign_id: string;
  name: string;
  description?: string;
  weight?: number;
  ai_provider_integration_id?: string;
}

export interface UpdateAgentInput {
  agent_id: string;
  name?: string;
  description?: string;
  weight?: number;
  status?: string;
}

export interface CreateAgentVersionInput {
  agent_id: string;
  prompt_text: string;
  system_rules_json?: Record<string, unknown>;
  reply_cadence_json?: Record<string, unknown>;
  allowed_actions_json?: Record<string, unknown>;
  qualification_rules_json?: Record<string, unknown>;
  config_json?: Record<string, unknown>;
}

export class AgentService {
  constructor(private readonly db: SupabaseClient) {}

  private applyDeletedFilter<T extends { is?: (column: string, value: null) => T }>(query: T): T {
    if (typeof query.is === 'function') {
      return query.is('deleted_at', null);
    }

    return query;
  }

  async create(input: CreateAgentInput): Promise<Agent> {
    // Build insert payload — only include optional columns if they have values,
    // so the insert works whether or not the migration has run yet.
    const row: Record<string, unknown> = {
      campaign_id: input.campaign_id,
      name: input.name,
      status: EntityStatus.Active,
      weight: input.weight ?? 1,
      ai_provider_integration_id: input.ai_provider_integration_id ?? null,
    };

    // Try to resolve workspace_id from campaign (needed after migration 006)
    const { data: campaign } = await this.db
      .from('campaigns')
      .select('workspace_id')
      .eq('id', input.campaign_id)
      .single();

    if (campaign?.workspace_id) {
      row.workspace_id = campaign.workspace_id;
    }
    if (input.description) {
      row.description = input.description;
    }

    const { data, error } = await this.db
      .from('agents')
      .insert(row)
      .select()
      .single();

    // If it fails because of missing columns, retry without them
    if (error?.message?.includes('column') && (error.message.includes('workspace_id') || error.message.includes('description'))) {
      delete row.workspace_id;
      delete row.description;
      const { data: retryData, error: retryErr } = await this.db
        .from('agents')
        .insert(row)
        .select()
        .single();
      if (retryErr) throw new Error(`Failed to create agent: ${retryErr.message}`);
      return retryData;
    }

    if (error) throw new Error(`Failed to create agent: ${error.message}`);
    return data;
  }

  async update(input: UpdateAgentInput): Promise<Agent> {
    const updates: Record<string, unknown> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.weight !== undefined) updates.weight = input.weight;
    if (input.status !== undefined) updates.status = input.status;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await this.db
      .from('agents')
      .update(updates)
      .eq('id', input.agent_id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update agent: ${error.message}`);
    return data;
  }

  async archive(agentId: string): Promise<Agent> {
    const { data, error } = await this.db
      .from('agents')
      .update({
        status: EntityStatus.Archived,
        updated_at: new Date().toISOString(),
      })
      .eq('id', agentId)
      .select()
      .single();

    if (error) throw new Error(`Failed to archive agent: ${error.message}`);
    return data;
  }

  async listByCampaign(campaignId: string): Promise<Agent[]> {
    const query = this.db
      .from('agents')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true });

    const filtered = this.applyDeletedFilter(query as any);
    const { data, error } = await filtered;

    if (error) throw new Error(`Failed to list agents: ${error.message}`);
    return data ?? [];
  }

  async listByWorkspace(workspaceId: string): Promise<(Agent & { campaign_name?: string })[]> {
    // Join through campaigns to filter by workspace_id (works whether or not
    // agents.workspace_id column exists yet — the FK is on campaign_id)
    const query = this.db
      .from('agents')
      .select('*, campaigns!inner(name, workspace_id)')
      .eq('campaigns.workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    const filtered = this.applyDeletedFilter(query as any);
    const { data, error } = await filtered;

    if (error) throw new Error(`Failed to list workspace agents: ${error.message}`);

    return (data ?? []).map((row: Record<string, unknown>) => {
      const campaigns = row.campaigns as { name: string; workspace_id: string } | null;
      return {
        ...row,
        campaign_name: campaigns?.name ?? 'Unknown',
        campaigns: undefined,
      };
    }) as (Agent & { campaign_name?: string })[];
  }

  /** Weighted random selection among active agents in a campaign */
  async selectForConversation(campaignId: string): Promise<{ agent: Agent; version: AgentVersion }> {
    const query = this.db
      .from('agents')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('status', EntityStatus.Active);

    const filtered = this.applyDeletedFilter(query as any);
    const { data: agents, error } = await filtered;

    if (error) throw new Error(`Failed to list agents: ${error.message}`);
    if (!agents || agents.length === 0) throw new Error('No active agents for campaign');

    // Weighted random pick
    const totalWeight = agents.reduce((sum: number, a: Agent) => sum + a.weight, 0);
    let random = Math.random() * totalWeight;
    let selected = agents[0];
    for (const agent of agents) {
      random -= agent.weight;
      if (random <= 0) {
        selected = agent;
        break;
      }
    }

    const version = await this.getActiveVersion(selected.id);
    if (!version) throw new Error(`No active version for agent ${selected.id}`);

    return { agent: selected, version };
  }

  async getActiveVersion(agentId: string): Promise<AgentVersion | null> {
    const { data, error } = await this.db
      .from('agent_versions')
      .select('*')
      .eq('agent_id', agentId)
      .eq('is_active', true)
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    if (error) return null;
    return data;
  }

  async getVersionById(versionId: string): Promise<AgentVersion | null> {
    const { data, error } = await this.db
      .from('agent_versions')
      .select('*')
      .eq('id', versionId)
      .single();

    if (error) return null;
    return data;
  }

  async listVersions(agentId: string): Promise<AgentVersion[]> {
    const { data, error } = await this.db
      .from('agent_versions')
      .select('*')
      .eq('agent_id', agentId)
      .order('version_number', { ascending: false });

    if (error) throw new Error(`Failed to list versions: ${error.message}`);
    return data ?? [];
  }

  async createVersion(input: CreateAgentVersionInput): Promise<AgentVersion> {
    // Get next version number
    const { data: latest } = await this.db
      .from('agent_versions')
      .select('version_number')
      .eq('agent_id', input.agent_id)
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    const nextVersion = (latest?.version_number ?? 0) + 1;

    // Deactivate previous versions
    await this.db
      .from('agent_versions')
      .update({ is_active: false })
      .eq('agent_id', input.agent_id);

    const row: Record<string, unknown> = {
      agent_id: input.agent_id,
      version_number: nextVersion,
      prompt_text: input.prompt_text,
      system_rules_json: input.system_rules_json ?? {},
      reply_cadence_json: input.reply_cadence_json ?? {
        initial_delay_seconds: 30,
        followup_delay_seconds: 3600,
        max_followups: 5,
      },
      config_json: input.config_json ?? {},
      is_active: true,
    };

    // New columns from migration 006 — include if provided
    if (input.allowed_actions_json) {
      row.allowed_actions_json = input.allowed_actions_json;
    }
    if (input.qualification_rules_json) {
      row.qualification_rules_json = input.qualification_rules_json;
    }

    const { data, error } = await this.db
      .from('agent_versions')
      .insert(row)
      .select()
      .single();

    // If it fails because of missing columns, retry without them
    if (error?.message?.includes('column') && (error.message.includes('allowed_actions') || error.message.includes('qualification_rules'))) {
      delete row.allowed_actions_json;
      delete row.qualification_rules_json;
      const { data: retryData, error: retryErr } = await this.db
        .from('agent_versions')
        .insert(row)
        .select()
        .single();
      if (retryErr) throw new Error(`Failed to create agent version: ${retryErr.message}`);
      return retryData;
    }

    if (error) throw new Error(`Failed to create agent version: ${error.message}`);
    return data;
  }

  async activateVersion(agentId: string, versionId: string): Promise<AgentVersion> {
    // Deactivate all versions for this agent
    await this.db
      .from('agent_versions')
      .update({ is_active: false })
      .eq('agent_id', agentId);

    // Activate the specified version
    const { data, error } = await this.db
      .from('agent_versions')
      .update({ is_active: true })
      .eq('id', versionId)
      .eq('agent_id', agentId)
      .select()
      .single();

    if (error) throw new Error(`Failed to activate version: ${error.message}`);
    return data;
  }
}
