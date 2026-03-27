import type { SupabaseClient } from '@supabase/supabase-js';
import type { Conversation } from '@lib/types';
import { ConversationStatus, ConversationOutcome, ConversationEventType } from '@lib/types';

export interface CreateConversationInput {
  workspace_id: string;
  campaign_id: string;
  agent_id: string;
  agent_version_id: string;
  lead_id: string;
}

export class ConversationService {
  constructor(private readonly db: SupabaseClient) {}

  private buildStatusUpdate(status: ConversationStatus): Record<string, unknown> {
    const now = new Date().toISOString();
    const isTerminal = status === ConversationStatus.Completed
      || status === ConversationStatus.OptedOut
      || status === ConversationStatus.Failed;

    return {
      status,
      needs_human: status === ConversationStatus.NeedsHuman,
      human_controlled: status === ConversationStatus.HumanControlled,
      last_activity_at: now,
      ...(isTerminal ? { closed_at: now } : {}),
    };
  }

  async create(input: CreateConversationInput): Promise<Conversation> {
    const { data, error } = await this.db
      .from('conversations')
      .insert({
        workspace_id: input.workspace_id,
        campaign_id: input.campaign_id,
        agent_id: input.agent_id,
        agent_version_id: input.agent_version_id,
        lead_id: input.lead_id,
        status: ConversationStatus.Queued,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create conversation: ${error.message}`);

    // Log creation event
    await this.logEvent(data.id, ConversationEventType.Created, { input });

    return data;
  }

  async getById(id: string): Promise<Conversation | null> {
    const { data, error } = await this.db
      .from('conversations')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) return null;
    return data;
  }

  /** Check if lead has an active conversation in any campaign */
  async getActiveForLead(leadId: string): Promise<Conversation | null> {
    const activeStatuses = [
      ConversationStatus.Queued,
      ConversationStatus.Active,
      ConversationStatus.WaitingForLead,
      ConversationStatus.PausedBusinessHours,
      ConversationStatus.PausedManual,
      ConversationStatus.NeedsHuman,
      ConversationStatus.HumanControlled,
    ];

    const { data, error } = await this.db
      .from('conversations')
      .select('*')
      .eq('lead_id', leadId)
      .in('status', activeStatuses)
      .is('deleted_at', null)
      .limit(1)
      .single();

    if (error) return null;
    return data;
  }

  async updateStatus(id: string, status: ConversationStatus): Promise<Conversation> {
    const { data, error } = await this.db
      .from('conversations')
      .update(this.buildStatusUpdate(status))
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update status: ${error.message}`);
    return data;
  }

  async setOutcome(id: string, outcome: ConversationOutcome): Promise<Conversation> {
    const { data, error } = await this.db
      .from('conversations')
      .update({ outcome })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to set outcome: ${error.message}`);
    return data;
  }

  async humanTakeover(id: string): Promise<Conversation> {
    const data = await this.updateStatus(id, ConversationStatus.HumanControlled);
    await this.logEvent(id, ConversationEventType.HumanTakeover, {});
    return data;
  }

  async releaseToAI(id: string): Promise<Conversation> {
    const data = await this.updateStatus(id, ConversationStatus.Active);
    await this.logEvent(id, ConversationEventType.HumanRelease, {});
    return data;
  }

  async listByWorkspace(workspaceId: string, filters?: { status?: ConversationStatus; limit?: number; offset?: number }): Promise<Conversation[]> {
    let query = this.db
      .from('conversations')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('last_activity_at', { ascending: false });

    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.limit) query = query.limit(filters.limit);
    if (filters?.offset) query = query.range(filters.offset, filters.offset + (filters.limit ?? 50) - 1);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to list conversations: ${error.message}`);
    return data ?? [];
  }

  private async logEvent(conversationId: string, eventType: ConversationEventType, payload: Record<string, unknown>): Promise<void> {
    await this.db.from('conversation_events').insert({
      conversation_id: conversationId,
      event_type: eventType,
      event_payload_json: payload,
    });
  }
}
