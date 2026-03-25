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

export class ReportingService {
  constructor(private readonly db: SupabaseClient) {}

  async getWorkspaceMetrics(workspaceId: string): Promise<WorkspaceMetrics> {
    const { data: conversations, error } = await this.db
      .from('conversations')
      .select('status, outcome')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null);

    if (error) throw new Error(`Failed to get metrics: ${error.message}`);
    const rows = conversations ?? [];

    const activeStatuses = [
      ConversationStatus.Active,
      ConversationStatus.WaitingForLead,
      ConversationStatus.NeedsHuman,
      ConversationStatus.HumanControlled,
    ];

    return {
      total_conversations: rows.length,
      active_conversations: rows.filter((c) => activeStatuses.includes(c.status)).length,
      booked: rows.filter((c) => c.outcome === ConversationOutcome.Booked).length,
      qualified_not_booked: rows.filter((c) => c.outcome === ConversationOutcome.QualifiedNotBooked).length,
      unqualified: rows.filter((c) => c.outcome === ConversationOutcome.Unqualified).length,
      no_response: rows.filter((c) => c.outcome === ConversationOutcome.NoResponse).length,
      opted_out: rows.filter((c) => c.outcome === ConversationOutcome.OptedOut).length,
      human_takeover: rows.filter((c) => c.outcome === ConversationOutcome.HumanTakeover).length,
    };
  }

  async getCampaignMetrics(campaignId: string): Promise<CampaignMetrics | null> {
    const { data: campaign } = await this.db
      .from('campaigns')
      .select('id, name, workspace_id')
      .eq('id', campaignId)
      .single();

    if (!campaign) return null;

    const { data: conversations } = await this.db
      .from('conversations')
      .select('id, status, outcome, agent_id')
      .eq('campaign_id', campaignId)
      .is('deleted_at', null);

    const rows = conversations ?? [];
    const activeStatuses = [ConversationStatus.Active, ConversationStatus.WaitingForLead];

    // Group by agent
    const agentGroups = new Map<string, typeof rows>();
    for (const c of rows) {
      const group = agentGroups.get(c.agent_id) ?? [];
      group.push(c);
      agentGroups.set(c.agent_id, group);
    }

    const { data: agents } = await this.db
      .from('agents')
      .select('id, name')
      .eq('campaign_id', campaignId);

    const agentMetrics: AgentMetrics[] = (agents ?? []).map((agent) => {
      const group = agentGroups.get(agent.id) ?? [];
      const total = group.length || 1; // avoid division by zero
      return {
        agent_id: agent.id,
        agent_name: agent.name,
        total_conversations: group.length,
        booking_rate: group.filter((c) => c.outcome === ConversationOutcome.Booked).length / total,
        opt_out_rate: group.filter((c) => c.outcome === ConversationOutcome.OptedOut).length / total,
        human_takeover_rate: group.filter((c) => c.outcome === ConversationOutcome.HumanTakeover).length / total,
        avg_messages_per_conversation: 0, // computed separately if needed
      };
    });

    return {
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      total_conversations: rows.length,
      active_conversations: rows.filter((c) => activeStatuses.includes(c.status)).length,
      booked: rows.filter((c) => c.outcome === ConversationOutcome.Booked).length,
      qualified_not_booked: rows.filter((c) => c.outcome === ConversationOutcome.QualifiedNotBooked).length,
      unqualified: rows.filter((c) => c.outcome === ConversationOutcome.Unqualified).length,
      no_response: rows.filter((c) => c.outcome === ConversationOutcome.NoResponse).length,
      opted_out: rows.filter((c) => c.outcome === ConversationOutcome.OptedOut).length,
      human_takeover: rows.filter((c) => c.outcome === ConversationOutcome.HumanTakeover).length,
      agent_metrics: agentMetrics,
    };
  }
}
