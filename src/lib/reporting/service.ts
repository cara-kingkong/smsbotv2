import type { SupabaseClient } from '@supabase/supabase-js';
import { ConversationStatus, ConversationOutcome } from '@lib/types';

export interface WorkspaceMetrics {
  total_conversations: number;
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

const ACTIVE_STATUSES = [
  ConversationStatus.Active,
  ConversationStatus.WaitingForLead,
  ConversationStatus.NeedsHuman,
  ConversationStatus.HumanControlled,
];

/** Compute metrics from a set of {status, outcome} rows without fetching full records */
function computeMetrics(rows: { status: string; outcome: string | null }[]): WorkspaceMetrics {
  const metrics: WorkspaceMetrics = {
    total_conversations: rows.length,
    active_conversations: 0,
    booked: 0,
    qualified_not_booked: 0,
    unqualified: 0,
    no_response: 0,
    opted_out: 0,
    human_takeover: 0,
  };

  for (const c of rows) {
    if (ACTIVE_STATUSES.includes(c.status as ConversationStatus)) metrics.active_conversations++;
    switch (c.outcome) {
      case ConversationOutcome.Booked: metrics.booked++; break;
      case ConversationOutcome.QualifiedNotBooked: metrics.qualified_not_booked++; break;
      case ConversationOutcome.Unqualified: metrics.unqualified++; break;
      case ConversationOutcome.NoResponse: metrics.no_response++; break;
      case ConversationOutcome.OptedOut: metrics.opted_out++; break;
      case ConversationOutcome.HumanTakeover: metrics.human_takeover++; break;
    }
  }

  return metrics;
}

export class ReportingService {
  constructor(private readonly db: SupabaseClient) {}

  async getWorkspaceMetrics(workspaceId: string): Promise<WorkspaceMetrics> {
    const { data: conversations, error } = await this.db
      .from('conversations')
      .select('status, outcome')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null);

    if (error) throw new Error(`Failed to get metrics: ${error.message}`);
    return computeMetrics(conversations ?? []);
  }

  /**
   * Fetch workspace metrics + all campaign metrics in minimal queries.
   * Replaces the old pattern of calling getCampaignMetrics() per campaign (N+1).
   */
  async getFullWorkspaceReport(workspaceId: string): Promise<{
    workspace_metrics: WorkspaceMetrics;
    campaigns: CampaignMetrics[];
  }> {
    // Fetch conversations and campaigns in parallel (2 queries instead of N+1)
    const [convResult, campaignResult] = await Promise.all([
      this.db
        .from('conversations')
        .select('status, outcome, campaign_id, agent_id')
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null),
      this.db
        .from('campaigns')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null),
    ]);

    if (convResult.error) throw new Error(`Failed to get metrics: ${convResult.error.message}`);

    const rows = convResult.data ?? [];
    const workspace_metrics = computeMetrics(rows);

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

    // Build agent name lookup
    const agentNameMap = new Map<string, string>();
    const agentCampaignMap = new Map<string, string>();
    for (const a of agentResult.data ?? []) {
      agentNameMap.set(a.id, a.name);
      agentCampaignMap.set(a.id, a.campaign_id);
    }

    // Group conversations by campaign_id
    const byCampaign = new Map<string, typeof rows>();
    // Also group by campaign_id + agent_id
    const byAgent = new Map<string, typeof rows>();

    for (const c of rows) {
      if (!c.campaign_id) continue;
      const group = byCampaign.get(c.campaign_id) ?? [];
      group.push(c);
      byCampaign.set(c.campaign_id, group);

      if (c.agent_id) {
        const agentKey = `${c.campaign_id}:${c.agent_id}`;
        const agentGroup = byAgent.get(agentKey) ?? [];
        agentGroup.push(c);
        byAgent.set(agentKey, agentGroup);
      }
    }

    // Build campaign metrics
    const campaigns: CampaignMetrics[] = [];
    for (const [campaignId, campaign] of campaignMap) {
      const campaignRows = byCampaign.get(campaignId) ?? [];
      const base = computeMetrics(campaignRows);

      // Build agent metrics for this campaign
      const agentMetrics: AgentMetrics[] = [];
      for (const [agentId, agentName] of agentNameMap) {
        if (agentCampaignMap.get(agentId) !== campaignId) continue;
        const agentKey = `${campaignId}:${agentId}`;
        const agentRows = byAgent.get(agentKey) ?? [];
        const total = agentRows.length || 1;
        agentMetrics.push({
          agent_id: agentId,
          agent_name: agentName,
          total_conversations: agentRows.length,
          booking_rate: agentRows.filter((c) => c.outcome === ConversationOutcome.Booked).length / total,
          opt_out_rate: agentRows.filter((c) => c.outcome === ConversationOutcome.OptedOut).length / total,
          human_takeover_rate: agentRows.filter((c) => c.outcome === ConversationOutcome.HumanTakeover).length / total,
          avg_messages_per_conversation: 0,
        });
      }

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
    const [campaignResult, convResult, agentResult] = await Promise.all([
      this.db
        .from('campaigns')
        .select('id, name, workspace_id')
        .eq('id', campaignId)
        .single(),
      this.db
        .from('conversations')
        .select('id, status, outcome, agent_id')
        .eq('campaign_id', campaignId)
        .is('deleted_at', null),
      this.db
        .from('agents')
        .select('id, name')
        .eq('campaign_id', campaignId),
    ]);

    if (!campaignResult.data) return null;
    const campaign = campaignResult.data;
    const rows = convResult.data ?? [];
    const base = computeMetrics(rows);

    // Group by agent
    const agentGroups = new Map<string, typeof rows>();
    for (const c of rows) {
      const group = agentGroups.get(c.agent_id) ?? [];
      group.push(c);
      agentGroups.set(c.agent_id, group);
    }

    const agentMetrics: AgentMetrics[] = (agentResult.data ?? []).map((agent) => {
      const group = agentGroups.get(agent.id) ?? [];
      const total = group.length || 1;
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        total_conversations: group.length,
        booking_rate: group.filter((c) => c.outcome === ConversationOutcome.Booked).length / total,
        opt_out_rate: group.filter((c) => c.outcome === ConversationOutcome.OptedOut).length / total,
        human_takeover_rate: group.filter((c) => c.outcome === ConversationOutcome.HumanTakeover).length / total,
        avg_messages_per_conversation: 0,
      };
    });

    return {
      ...base,
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      agent_metrics: agentMetrics,
    };
  }
}
