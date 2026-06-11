import type { SupabaseClient } from '@supabase/supabase-js';
import { ConversationOutcome, ConversationStatus, CRMEventType } from '@lib/types';
import { ConversationService } from '@lib/conversations/service';
import { CRMService } from '@lib/crm/service';
import { QueueService } from '@lib/queues/service';
import { buildConversationNote } from '@lib/crm/notes';

export interface RecordOptOutInput {
  conversationId: string;
  campaignId: string;
  workspaceId: string;
  leadId: string;
  /** CRM contact id, when the lead is linked to a CRM contact. */
  externalContactId: string | null;
}

/**
 * Honour a lead's opt-out / removal request, identically regardless of how it
 * was detected (deterministic keyword match at the Twilio webhook, or the AI's
 * request_removal flag during reply generation).
 *
 * Effects:
 *  - conversation outcome → OptedOut, status → OptedOut
 *  - leads.opted_out → true (stops all future outreach to this lead)
 *  - when the lead has a CRM contact, emit a ConversationOptedOut CRM event
 *    (applies the campaign's mapped unsubscribe tag + writes a note) and queue
 *    the CRM sync job.
 *
 * Centralising this means the two entry points can never drift — a lead who
 * opts out always ends up in the same state with the same CRM side effects.
 */
export async function recordOptOut(
  db: SupabaseClient,
  queueService: QueueService,
  input: RecordOptOutInput,
): Promise<void> {
  const conversationService = new ConversationService(db);

  await conversationService.setOutcome(input.conversationId, ConversationOutcome.OptedOut);
  await conversationService.updateStatus(input.conversationId, ConversationStatus.OptedOut);
  await db.from('leads').update({ opted_out: true }).eq('id', input.leadId);

  if (!input.externalContactId) return;

  const { data: crmIntegration } = await db
    .from('integrations')
    .select('id, provider')
    .eq('workspace_id', input.workspaceId)
    .eq('type', 'crm')
    .eq('status', 'active')
    .limit(1)
    .single();

  if (!crmIntegration) return;

  // Per-campaign tag mapping + name for the note subheading.
  const { data: campaignRow } = await db
    .from('campaigns')
    .select('name, crm_tag_mappings_json')
    .eq('id', input.campaignId)
    .maybeSingle();
  const tagMappings = (campaignRow?.crm_tag_mappings_json ?? {}) as Record<string, string>;
  const mappedTag = (tagMappings[CRMEventType.ConversationOptedOut] ?? '').toString().trim();

  const noteBody = await buildConversationNote(db, input.conversationId, {
    headline: 'Lead OPTED OUT of SMS chatbot',
    subheading: campaignRow?.name ? `Campaign: ${campaignRow.name}` : undefined,
  });

  const crmService = new CRMService(db, new Map());
  const crmEvent = await crmService.emitEvent({
    workspace_id: input.workspaceId,
    conversation_id: input.conversationId,
    integration_id: crmIntegration.id,
    event_type: CRMEventType.ConversationOptedOut,
    external_contact_id: input.externalContactId,
    payload: {
      external_contact_id: input.externalContactId,
      tag_name: mappedTag || null,
      note_body: noteBody,
    },
  });

  await queueService.enqueue({
    workspace_id: input.workspaceId,
    job_type: 'process_crm_sync',
    queue_name: 'crm',
    payload: { crm_event_id: crmEvent.id, provider: crmIntegration.provider },
  });
}
