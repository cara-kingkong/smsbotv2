import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { LeadService } from '../../src/lib/leads/service';
import { ConversationService } from '../../src/lib/conversations/service';
import { AgentService } from '../../src/lib/agents/service';
import { QueueService } from '../../src/lib/queues/service';
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

  try {
    const payload = (await req.json()) as StartConversationWebhookPayload;

    // Validate required fields
    if (!payload.workspace_id || !payload.campaign_id || !payload.lead?.phone || !payload.lead?.first_name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: workspace_id, campaign_id, lead.phone, lead.first_name' }),
        { status: 400 },
      );
    }

    const idempotencyKey = payload.idempotency_key ?? nanoid();

    // Check idempotency
    const { data: existing } = await db
      .from('webhook_receipts')
      .select('id')
      .eq('workspace_id', payload.workspace_id)
      .eq('idempotency_key', idempotencyKey)
      .limit(1)
      .single();

    if (existing) {
      return new Response(JSON.stringify({ message: 'Already processed', idempotency_key: idempotencyKey }), { status: 200 });
    }

    // Store raw webhook receipt
    await db.from('webhook_receipts').insert({
      workspace_id: payload.workspace_id,
      source_type: 'start_conversation',
      source_identifier: payload.lead.phone,
      idempotency_key: idempotencyKey,
      payload_json: payload,
      processed_status: 'processing',
    });

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

    // Check for existing active conversation
    const conversationService = new ConversationService(db);
    const activeConversation = await conversationService.getActiveForLead(lead.id);
    if (activeConversation) {
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
    const queueService = new QueueService(db);
    await queueService.enqueue({
      workspace_id: payload.workspace_id,
      job_type: 'generate_ai_reply',
      queue_name: 'ai',
      payload: {
        conversation_id: conversation.id,
        trigger: 'conversation_start',
      },
      run_at: new Date(Date.now() + (version.reply_cadence_json as Record<string, number>).initial_delay_seconds * 1000),
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
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500 },
    );
  }
};
