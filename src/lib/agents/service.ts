import type { SupabaseClient } from '@supabase/supabase-js';
import type { Agent, AgentVersion } from '@lib/types';
import { EntityStatus } from '@lib/types';

export interface CreateAgentInput {
  campaign_id: string;
  name: string;
  weight?: number;
  ai_provider_integration_id?: string;
}

export interface CreateAgentVersionInput {
  agent_id: string;
  prompt_text: string;
  system_rules_json?: Record<string, unknown>;
  reply_cadence_json?: Record<string, unknown>;
  config_json?: Record<string, unknown>;
}

export class AgentService {
  constructor(private readonly db: SupabaseClient) {}

  async create(input: CreateAgentInput): Promise<Agent> {
    const { data, error } = await this.db
      .from('agents')
      .insert({
        campaign_id: input.campaign_id,
        name: input.name,
        status: EntityStatus.Active,
        weight: input.weight ?? 1,
        ai_provider_integration_id: input.ai_provider_integration_id ?? null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create agent: ${error.message}`);
    return data;
  }

  async listByCampaign(campaignId: string): Promise<Agent[]> {
    const { data, error } = await this.db
      .from('agents')
      .select('*')
      .eq('campaign_id', campaignId)
      .is('deleted_at', null)
      .eq('status', EntityStatus.Active);

    if (error) throw new Error(`Failed to list agents: ${error.message}`);
    return data ?? [];
  }

  /** Weighted random selection among active agents in a campaign */
  async selectForConversation(campaignId: string): Promise<{ agent: Agent; version: AgentVersion }> {
    const agents = await this.listByCampaign(campaignId);
    if (agents.length === 0) throw new Error('No active agents for campaign');

    // Weighted random pick
    const totalWeight = agents.reduce((sum, a) => sum + a.weight, 0);
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

    const { data, error } = await this.db
      .from('agent_versions')
      .insert({
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
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create agent version: ${error.message}`);
    return data;
  }
}
