import type { SupabaseClient } from '@supabase/supabase-js';

export interface WorkspaceMetrics {
  total_conversations: number;
  engaged_conversations: number;
  active_conversations: number;
  booked: number;
  qualified_not_booked: number;
  unqualified: number;
  no_response: number;
  opted_out: number;
  human_takeover: number;
}

export interface CampaignMetrics extends WorkspaceMetrics {
  campaign_id: string;
  campaign_name: string;
  agent_metrics: AgentMetrics[];
}

export interface AgentMetrics {
  agent_id: string;
  agent_name: string;
  total_conversations: number;
  booking_rate: number;
  opt_out_rate: number;
  human_takeover_rate: number;
  avg_messages_per_conversation: number;
}

/**
 * One pre-aggregated row per (campaign, agent), returned by the
 * `workspace_conversation_metrics` RPC. Counting happens in Postgres so we
 * never fetch raw conversation rows (which PostgREST caps at `max_rows`,
 * silently undercounting workspaces with >1000 conversations). bigint counts
 * arrive as strings, hence the Number() coercion when summing.
 */
interface AggRow {
  campaign_id: string | null;
  agent_id: string | null;
  total: number | string;
  engaged: number | string;
  active: number | string;
  booked: number | string;
  qualified_not_booked: number | string;
  unqualified: number | string;
  no_response: number | string;
  opted_out: number | string;
  human_takeover: number | string;
}

/** Sum a set of aggregated rows into a WorkspaceMetrics tally. */
function sumAggRows(rows: AggRow[]): WorkspaceMetrics {
  const m: WorkspaceMetrics = {
    total_conversations: 0,
    engaged_conversations: 0,
    active_conversations: 0,
    booked: 0,
    qualified_not_booked: 0,
    unqualified: 0,
    no_response: 0,
    opted_out: 0,
    human_takeover: 0,
  };

  for (const r of rows) {
    m.total_conversations += Number(r.total);
    m.engaged_conversations += Number(r.engaged);
    m.active_conversations += Number(r.active);
    m.booked += Number(r.booked);
    m.qualified_not_booked += Number(r.qualified_not_booked);
    m.unqualified += Number(r.unqualified);
    m.no_response += Number(r.no_response);
    m.opted_out += Number(r.opted_out);
    m.human_takeover += Number(r.human_takeover);
  }

  return m;
}

function agentMetricsFrom(agentId: string, agentName: string, row: AggRow | undefined): AgentMetrics {
  const total = row ? Number(row.total) : 0;
  const denom = total || 1;
  return {
    agent_id: agentId,
    agent_name: agentName,
    total_conversations: total,
    booking_rate: row ? Number(row.booked) / denom : 0,
    opt_out_rate: row ? Number(row.opted_out) / denom : 0,
    human_takeover_rate: row ? Number(row.human_takeover) / denom : 0,
    avg_messages_per_conversation: 0,
  };
}

export class ReportingService {
  constructor(private readonly db: SupabaseClient) {}

  /** Fetch the workspace-wide conversation aggregates (server-side counted). */
  private async fetchAggregates(workspaceId: string): Promise<AggRow[]> {
    const { data, error } = await this.db.rpc('workspace_conversation_metrics', {
      p_workspace_id: workspaceId,
    });
    if (error) throw new Error(`Failed to get metrics: ${error.message}`);
    return (data ?? []) as AggRow[];
  }

  async getWorkspaceMetrics(workspaceId: string): Promise<WorkspaceMetrics> {
    return sumAggRows(await this.fetchAggregates(workspaceId));
  }

  /**
   * Fetch workspace metrics + all campaign metrics in minimal queries.
   * Counts are aggregated in Postgres (one row per campaign/agent) so the
   * dashboard stays accurate regardless of conversation volume.
   */
  async getFullWorkspaceReport(workspaceId: string): Promise<{
    workspace_metrics: WorkspaceMetrics;
    campaigns: CampaignMetrics[];
  }> {
    const [aggRows, campaignResult] = await Promise.all([
      this.fetchAggregates(workspaceId),
      this.db
        .from('campaigns')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null),
    ]);

    const workspace_metrics = sumAggRows(aggRows);

    // Build campaign map
    const campaignMap = new Map<string, { id: string; name: string }>();
    for (const c of campaignResult.data ?? []) {
      campaignMap.set(c.id, c);
    }

    // Fetch agents for all campaigns in one query
    const campaignIds = Array.from(campaignMap.keys());
    const agentResult = campaignIds.length > 0
      ? await this.db
          .from('agents')
          .select('id, name, campaign_id')
          .in('campaign_id', campaignIds)
          .is('deleted_at', null)
      : { data: [] as { id: string; name: string; campaign_id: string }[], error: null };

    // Index aggregate rows by campaign and by campaign:agent
    const aggByCampaign = new Map<string, AggRow[]>();
    const aggByAgentKey = new Map<string, AggRow>();
    for (const r of aggRows) {
      if (!r.campaign_id) continue;
      const group = aggByCampaign.get(r.campaign_id) ?? [];
      group.push(r);
      aggByCampaign.set(r.campaign_id, group);
      if (r.agent_id) aggByAgentKey.set(`${r.campaign_id}:${r.agent_id}`, r);
    }

    // Group agents by campaign
    const agentsByCampaign = new Map<string, { id: string; name: string }[]>();
    for (const a of agentResult.data ?? []) {
      const group = agentsByCampaign.get(a.campaign_id) ?? [];
      group.push({ id: a.id, name: a.name });
      agentsByCampaign.set(a.campaign_id, group);
    }

    // Build campaign metrics
    const campaigns: CampaignMetrics[] = [];
    for (const [campaignId, campaign] of campaignMap) {
      const base = sumAggRows(aggByCampaign.get(campaignId) ?? []);
      const agentMetrics = (agentsByCampaign.get(campaignId) ?? []).map((agent) =>
        agentMetricsFrom(agent.id, agent.name, aggByAgentKey.get(`${campaignId}:${agent.id}`)),
      );

      campaigns.push({
        ...base,
        campaign_id: campaignId,
        campaign_name: campaign.name,
        agent_metrics: agentMetrics,
      });
    }

    return { workspace_metrics, campaigns };
  }

  async getCampaignMetrics(campaignId: string): Promise<CampaignMetrics | null> {
    const campaignResult = await this.db
      .from('campaigns')
      .select('id, name, workspace_id')
      .eq('id', campaignId)
      .single();

    if (!campaignResult.data) return null;
    const campaign = campaignResult.data;

    const [aggRows, agentResult] = await Promise.all([
      this.fetchAggregates(campaign.workspace_id),
      this.db
        .from('agents')
        .select('id, name')
        .eq('campaign_id', campaignId),
    ]);

    const campaignRows = aggRows.filter((r) => r.campaign_id === campaignId);
    const base = sumAggRows(campaignRows);

    const aggByAgent = new Map<string, AggRow>();
    for (const r of campaignRows) {
      if (r.agent_id) aggByAgent.set(r.agent_id, r);
    }

    const agentMetrics: AgentMetrics[] = (agentResult.data ?? []).map((agent) =>
      agentMetricsFrom(agent.id, agent.name, aggByAgent.get(agent.id)),
    );

    return {
      ...base,
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      agent_metrics: agentMetrics,
    };
  }
}
