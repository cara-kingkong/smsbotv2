import type { SupabaseClient } from '@supabase/supabase-js';
import type { QueueService } from '@lib/queues/service';
import { CRMEventType, MessageDirection } from '@lib/types';
import { CRMService } from './service';

/**
 * Apply the per-campaign "message sent" CRM tag the first time an outbound
 * message is successfully delivered in a conversation.
 *
 * Unlike the state-transition events (booked / qualified / ...), this fires on
 * the FIRST real send regardless of who sent it (AI, system, or a human
 * operator), applies a tag only (no note), and never fires again for the
 * conversation.
 *
 * Safe to call after every dispatch: it gates cheaply on the send count and
 * no-ops when there's no mapping, no CRM contact, or no active CRM integration.
 * Failures are swallowed — a CRM hiccup must never fail an already-sent SMS.
 */
export async function applyFirstMessageSentTag(
  db: SupabaseClient,
  queueService: QueueService,
  conversationId: string,
): Promise<void> {
  try {
    // Gate: only the FIRST outbound message that actually reached the provider.
    // provider_message_id is set solely on a real send (test / queued / failed
    // messages never have one), so a count of exactly 1 means it's this send.
    const { count, error: countError } = await db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('direction', MessageDirection.Outbound)
      .not('provider_message_id', 'is', null);

    if (countError || count !== 1) return;

    const { data: conversation } = await db
      .from('conversations')
      .select('workspace_id, campaign_id, lead_id')
      .eq('id', conversationId)
      .maybeSingle();
    if (!conversation) return;

    // Per-campaign tag mapping. Empty/missing entry means "skip" — no tag.
    const { data: campaign } = await db
      .from('campaigns')
      .select('crm_tag_mappings_json')
      .eq('id', conversation.campaign_id)
      .maybeSingle();

    const tagMappings = (campaign?.crm_tag_mappings_json ?? {}) as Record<string, string>;
    const mappedTag = (tagMappings[CRMEventType.ConversationMessageSent] ?? '').toString().trim();
    if (!mappedTag) return;

    const { data: lead } = await db
      .from('leads')
      .select('external_contact_id')
      .eq('id', conversation.lead_id)
      .maybeSingle();
    const externalContactId = lead?.external_contact_id;
    if (!externalContactId) return;

    const { data: crmIntegration } = await db
      .from('integrations')
      .select('id, provider')
      .eq('workspace_id', conversation.workspace_id)
      .eq('type', 'crm')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    if (!crmIntegration) return;

    const crmService = new CRMService(db, new Map());
    const crmEvent = await crmService.emitEvent({
      workspace_id: conversation.workspace_id,
      conversation_id: conversationId,
      integration_id: crmIntegration.id,
      event_type: CRMEventType.ConversationMessageSent,
      external_contact_id: externalContactId,
      payload: {
        external_contact_id: externalContactId,
        tag_name: mappedTag,
        // Tag only — message-sent never writes a note.
      },
    });

    await queueService.enqueue({
      workspace_id: conversation.workspace_id,
      job_type: 'process_crm_sync',
      queue_name: 'crm',
      payload: { crm_event_id: crmEvent.id, provider: crmIntegration.provider },
    });
  } catch (err) {
    console.error(`applyFirstMessageSentTag failed for conversation ${conversationId}:`, err);
  }
}
