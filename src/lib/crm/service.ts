import type { SupabaseClient } from '@supabase/supabase-js';
import type { CRMAdapter, CRMEvent } from '@lib/types';
import { CRMEventType, CRMSyncStatus } from '@lib/types';
import { AuditService } from '@lib/audit/service';

export interface EmitCRMEventInput {
  workspace_id: string;
  conversation_id: string;
  integration_id: string;
  event_type: CRMEventType;
  external_contact_id: string;
  payload: Record<string, unknown>;
}

export class CRMService {
  constructor(
    private readonly db: SupabaseClient,
    private readonly adapters: Map<string, CRMAdapter>,
  ) {}

  async emitEvent(input: EmitCRMEventInput): Promise<CRMEvent> {
    // Persist the event record
    const { data: event, error } = await this.db
      .from('crm_events')
      .insert({
        workspace_id: input.workspace_id,
        conversation_id: input.conversation_id,
        integration_id: input.integration_id,
        event_type: input.event_type,
        status: CRMSyncStatus.Pending,
        request_payload_json: input.payload,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create CRM event: ${error.message}`);
    return event;
  }

  /** Process a pending CRM event — called by background function */
  async processCRMEvent(eventId: string, providerKey: string): Promise<void> {
    const { data: event } = await this.db
      .from('crm_events')
      .select('*')
      .eq('id', eventId)
      .single();

    if (!event) throw new Error(`CRM event not found: ${eventId}`);
    if (event.status === CRMSyncStatus.Sent) return;

    const adapter = this.adapters.get(providerKey);
    if (!adapter) throw new Error(`No CRM adapter for: ${providerKey}`);

    try {
      let result: { success: boolean; raw_response: Record<string, unknown> };

      switch (event.event_type) {
        case CRMEventType.ConversationBooked:
          result = await adapter.applyTag({
            external_contact_id: event.request_payload_json.external_contact_id as string,
            tag_name: event.request_payload_json.tag_name as string,
          });
          break;
        default:
          result = await adapter.createNote({
            external_contact_id: event.request_payload_json.external_contact_id as string,
            note_body: event.request_payload_json.note_body as string,
          });
      }

      await this.db
        .from('crm_events')
        .update({
          status: CRMSyncStatus.Sent,
          response_payload_json: result.raw_response,
        })
        .eq('id', eventId);

      new AuditService(this.db).log({
        workspace_id: event.workspace_id,
        entity_type: 'integration',
        entity_id: eventId,
        action_type: 'crm_sync_success',
        metadata: { provider: providerKey, event_type: event.event_type },
      }).catch((err2) => console.warn('Audit log failed:', err2));
    } catch (err) {
      const retryCount = (event.retry_count ?? 0) + 1;
      const finalStatus = retryCount >= 3 ? CRMSyncStatus.Failed : CRMSyncStatus.Retrying;
      await this.db
        .from('crm_events')
        .update({
          status: finalStatus,
          retry_count: retryCount,
          response_payload_json: { error: err instanceof Error ? err.message : 'Unknown' },
        })
        .eq('id', eventId);

      if (finalStatus === CRMSyncStatus.Failed) {
        new AuditService(this.db).log({
          workspace_id: event.workspace_id,
          entity_type: 'integration',
          entity_id: eventId,
          action_type: 'crm_sync_failed',
          metadata: { provider: providerKey, event_type: event.event_type, retry_count: retryCount },
        }).catch((err2) => console.warn('Audit log failed:', err2));
      }
    }
  }
}
