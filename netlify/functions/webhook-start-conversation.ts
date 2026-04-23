import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { LeadService } from '../../src/lib/leads/service';
import { ConversationService } from '../../src/lib/conversations/service';
import { AgentService } from '../../src/lib/agents/service';
import { QueueService } from '../../src/lib/queues/service';
import { PhoneNumberService } from '../../src/lib/messaging/phone-numbers';
import type { StartConversationWebhookPayload } from '../../src/lib/types';
import { nanoid } from 'nanoid';

/**
 * Generic webhook to start a conversation.
 * POST /.netlify/functions/webhook-start-conversation
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();
  let receiptContext: { workspaceId: string; idempotencyKey: string } | null = null;

  try {
    const payload = (await req.json()) as StartConversationWebhookPayload;

    // Validate required fields
    if (
      !payload.workspace_id ||
      !payload.campaign_id ||
      !payload.lead?.phone ||
      !payload.lead?.first_name ||
      !payload.lead?.email ||
      !payload.lead?.timezone
    ) {
      return new Response(
        JSON.stringify({
          error:
            'Missing required fields: workspace_id, campaign_id, lead.phone, lead.first_name, lead.email, lead.timezone',
        }),
        { status: 400 },
      );
    }

    const idempotencyKey = payload.idempotency_key ?? nanoid();
    receiptContext = { workspaceId: payload.workspace_id, idempotencyKey };

    // Check idempotency
    const { data: existing } = await db
      .from('webhook_receipts')
      .select('id, processed_status')
      .eq('workspace_id', payload.workspace_id)
      .eq('idempotency_key', idempotencyKey)
      .limit(1)
      .single();

    if (existing) {
      if (existing.processed_status === 'completed') {
        return new Response(JSON.stringify({ message: 'Already processed', idempotency_key: idempotencyKey }), { status: 200 });
      }

      if (existing.processed_status === 'failed') {
        await db
          .from('webhook_receipts')
          .update({ processed_status: 'processing' })
          .eq('workspace_id', payload.workspace_id)
          .eq('idempotency_key', idempotencyKey);
      } else {
        return new Response(JSON.stringify({ error: 'Request already in progress' }), { status: 409 });
      }
    } else {
      // Store raw webhook receipt
      await db.from('webhook_receipts').insert({
        workspace_id: payload.workspace_id,
        source_type: 'start_conversation',
        source_identifier: payload.lead.phone,
        idempotency_key: idempotencyKey,
        payload_json: payload,
        processed_status: 'processing',
      });
    }

    // Upsert lead
    const leadService = new LeadService(db);
    const lead = await leadService.upsertByPhone({
      workspace_id: payload.workspace_id,
      phone: payload.lead.phone,
      first_name: payload.lead.first_name,
      last_name: payload.lead.last_name,
      email: payload.lead.email,
      timezone: payload.lead.timezone,
      external_contact_id: payload.lead.external_contact_id,
      source_json: payload.source_metadata,
    });

    // Check workspace has a phone number that can reach this lead's country
    const phoneNumbers = new PhoneNumberService(db);
    const fromNumber = await phoneNumbers.resolveForLead(payload.workspace_id, lead.phone_e164);
    if (!fromNumber) {
      await db
        .from('webhook_receipts')
        .update({ processed_status: 'completed' })
        .eq('workspace_id', payload.workspace_id)
        .eq('idempotency_key', idempotencyKey);

      return new Response(
        JSON.stringify({
          message: 'No phone number available for lead country — lead created, conversation skipped',
          lead_id: lead.id,
        }),
        { status: 200 },
      );
    }

    // Check for existing active conversation
    const conversationService = new ConversationService(db);
    const activeConversation = await conversationService.getActiveForLead(lead.id);
    if (activeConversation) {
      await db
        .from('webhook_receipts')
        .update({ processed_status: 'completed' })
        .eq('workspace_id', payload.workspace_id)
        .eq('idempotency_key', idempotencyKey);

      return new Response(
        JSON.stringify({ message: 'Lead already has an active conversation', conversation_id: activeConversation.id }),
        { status: 200 },
      );
    }

    // Select agent via weighted random
    const agentService = new AgentService(db);
    const { agent, version } = await agentService.selectForConversation(payload.campaign_id);

    // Create conversation
    const conversation = await conversationService.create({
      workspace_id: payload.workspace_id,
      campaign_id: payload.campaign_id,
      agent_id: agent.id,
      agent_version_id: version.id,
      lead_id: lead.id,
    });

    // Queue initial AI reply job
    const cadence = version.reply_cadence_json as Record<string, number> | null;
    const isManualStart = payload.source_metadata?.source === 'manual_ui';
    const delaySec = isManualStart ? 0 : (cadence?.reply_delay_seconds ?? cadence?.initial_delay_seconds ?? 0);
    const runAt = new Date(Date.now() + delaySec * 1000);

    const queueService = new QueueService(db);
    await queueService.enqueue({
      workspace_id: payload.workspace_id,
      job_type: 'generate_ai_reply',
      queue_name: 'ai',
      payload: {
        conversation_id: conversation.id,
        trigger: 'conversation_start',
      },
      run_at: runAt,
    });


    // Update webhook receipt
    await db
      .from('webhook_receipts')
      .update({ processed_status: 'completed' })
      .eq('workspace_id', payload.workspace_id)
      .eq('idempotency_key', idempotencyKey);

    return new Response(
      JSON.stringify({
        conversation_id: conversation.id,
        lead_id: lead.id,
        agent_id: agent.id,
        agent_version_id: version.id,
      }),
      { status: 201 },
    );
  } catch (err) {
    console.error('webhook-start-conversation error:', err);
    if (receiptContext) {
      await db
        .from('webhook_receipts')
        .update({ processed_status: 'failed' })
        .eq('workspace_id', receiptContext.workspaceId)
        .eq('idempotency_key', receiptContext.idempotencyKey);
    }
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500 },
    );
  }
};
