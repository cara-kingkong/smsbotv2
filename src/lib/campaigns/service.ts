import type { SupabaseClient } from '@supabase/supabase-js';
import type { Campaign, BusinessHours, StopConditions } from '@lib/types';
import { EntityStatus } from '@lib/types';

export interface CreateCampaignInput {
  workspace_id: string;
  name: string;
  business_hours_json?: BusinessHours;
  stop_conditions_json?: StopConditions;
}

export class CampaignService {
  constructor(private readonly db: SupabaseClient) {}

  async create(input: CreateCampaignInput): Promise<Campaign> {
    const { data, error } = await this.db
      .from('campaigns')
      .insert({
        workspace_id: input.workspace_id,
        name: input.name,
        status: EntityStatus.Active,
        business_hours_json: input.business_hours_json ?? {},
        stop_conditions_json: input.stop_conditions_json ?? {},
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create campaign: ${error.message}`);
    return data;
  }

  async getById(id: string): Promise<Campaign | null> {
    const { data, error } = await this.db
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) return null;
    return data;
  }

  async listByWorkspace(workspaceId: string): Promise<(Campaign & { agent_count: number })[]> {
    const { data, error } = await this.db
      .from('campaigns')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to list campaigns: ${error.message}`);

    const campaigns = data ?? [];
    if (campaigns.length === 0) return [];

    // Tally non-deleted agents per campaign in one query so the list view can
    // show an assignment count without an N+1 fan-out.
    const campaignIds = campaigns.map((c) => c.id);
    const { data: agents, error: agentsError } = await this.db
      .from('agents')
      .select('campaign_id')
      .in('campaign_id', campaignIds)
      .is('deleted_at', null);

    if (agentsError) throw new Error(`Failed to count campaign agents: ${agentsError.message}`);

    const countByCampaign = new Map<string, number>();
    for (const agent of (agents ?? []) as { campaign_id: string }[]) {
      countByCampaign.set(agent.campaign_id, (countByCampaign.get(agent.campaign_id) ?? 0) + 1);
    }

    return campaigns.map((c) => ({ ...c, agent_count: countByCampaign.get(c.id) ?? 0 }));
  }

  async update(id: string, updates: Partial<Pick<Campaign, 'name' | 'status' | 'business_hours_json' | 'stop_conditions_json' | 'crm_tag_mappings_json'>>): Promise<Campaign> {
    const { data, error } = await this.db
      .from('campaigns')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update campaign: ${error.message}`);
    return data;
  }

  async softDelete(id: string): Promise<void> {
    const { error } = await this.db
      .from('campaigns')
      .update({ deleted_at: new Date().toISOString(), status: EntityStatus.Deleted })
      .eq('id', id);

    if (error) throw new Error(`Failed to delete campaign: ${error.message}`);
  }
}
