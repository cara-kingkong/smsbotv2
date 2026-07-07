import type { SupabaseClient } from '@supabase/supabase-js';
import type { Conversation } from '@lib/types';
import { ConversationStatus, ConversationOutcome, ConversationEventType } from '@lib/types';
import { AuditService } from '@lib/audit/service';

export interface CreateConversationInput {
  workspace_id: string;
  campaign_id: string;
  agent_id: string;
  agent_version_id: string;
  lead_id: string;
  is_test?: boolean;
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
      // Terminal transitions only record closed_at — leaving last_activity_at
      // at the time of the last real message so closing doesn't bump the
      // conversation to the top of the recency-sorted inbox.
      ...(isTerminal
        ? { closed_at: now }
        : { last_activity_at: now }),
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
        ...(input.is_test ? { is_test: true } : {}),
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

    this.audit(data.workspace_id, 'conversation', id, `status_${status}`, { status })
      .catch((err) => console.warn('Audit log failed:', err));

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

    this.audit(data.workspace_id, 'conversation', id, `outcome_${outcome}`, { outcome })
      .catch((err) => console.warn('Audit log failed:', err));

    return data;
  }

  async humanTakeover(id: string): Promise<Conversation> {
    const data = await this.updateStatus(id, ConversationStatus.HumanControlled);
    await this.logEvent(id, ConversationEventType.HumanTakeover, {});
    return data;
  }

  /**
   * Manually record a `booked` outcome without running any booking automation.
   * For when a human operator has taken the thread over and booked the lead
   * out-of-band (e.g. on a call) and just needs the result reflected in
   * reporting. Deliberately side-effect free: no Calendly hold, no CRM sync,
   * no confirmation SMS. The conversation status is left untouched so the
   * operator keeps the open thread, and the outcome column can be changed again
   * later — this is a reversible label, not a terminal transition.
   */
  async markBookedManually(id: string): Promise<Conversation> {
    const data = await this.setOutcome(id, ConversationOutcome.Booked);
    await this.logEvent(id, ConversationEventType.BookingMarkedManual, { source: 'manual_operator' });
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

  private async audit(
    workspaceId: string, entityType: string, entityId: string,
    actionType: string, metadata?: Record<string, unknown>,
  ): Promise<void> {
    const svc = new AuditService(this.db);
    await svc.log({ workspace_id: workspaceId, entity_type: entityType, entity_id: entityId, action_type: actionType, metadata });
  }

  private async logEvent(conversationId: string, eventType: ConversationEventType, payload: Record<string, unknown>): Promise<void> {
    await this.db.from('conversation_events').insert({
      conversation_id: conversationId,
      event_type: eventType,
      event_payload_json: payload,
    });
  }
}
