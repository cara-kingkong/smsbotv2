import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { ConversationService } from '../../src/lib/conversations/service';
import { AgentService } from '../../src/lib/agents/service';
import { QueueService } from '../../src/lib/queues/service';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';
import { requireRole } from '../../src/lib/auth/permissions';
import { EntityStatus, WorkspaceRole } from '../../src/lib/types';
import { nanoid } from 'nanoid';

interface CreateDebugBody {
  workspace_id: string;
  campaign_id: string;
  agent_id?: string;
  /** When true, queue an initial AI reply so the agent sends the first
   *  outreach (mirrors production webhook-start-conversation). When false,
   *  the conversation waits for the user to type as the lead. Default true. */
  ai_starts?: boolean;
  lead: {
    first_name: string;
    last_name?: string;
    email?: string;
    phone?: string;
    timezone?: string;
    /** Existing CRM contact ID. When set, qualify/book events sync to this
     *  real contact so the CRM integration can be tested end-to-end. */
    external_contact_id?: string;
  };
}

/**
 * Create a debug (test) conversation.
 * POST /.netlify/functions/api-debug-conversation-create
 *
 * Bypasses Twilio entirely. Creates a workspace-scoped `is_test` lead and
 * conversation, plus enqueues nothing — the first inbound is sent via
 * api-debug-conversation-send. AI / CRM / Calendly paths run as normal.
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const body = (await req.json()) as CreateDebugBody;

    if (!body.workspace_id || !body.campaign_id || !body.lead?.first_name) {
      return new Response(
        JSON.stringify({ error: 'workspace_id, campaign_id, and lead.first_name are required' }),
        { status: 400 },
      );
    }

    const access = await requireWorkspaceAccess(req, body.workspace_id);
    if (access instanceof Response) return access;
    const guard = requireRole(access, WorkspaceRole.Manager);
    if (guard instanceof Response) return guard;

    // Verify campaign belongs to workspace
    const { data: campaign } = await db
      .from('campaigns')
      .select('id, workspace_id')
      .eq('id', body.campaign_id)
      .is('deleted_at', null)
      .single();

    if (!campaign || campaign.workspace_id !== access.workspace.id) {
      return new Response(JSON.stringify({ error: 'Campaign not found' }), { status: 404 });
    }

    // Pick agent + active version. If caller pinned an agent, use it; otherwise
    // fall back to weighted-random selection (matches production behaviour).
    const agentService = new AgentService(db);
    let agentId: string;
    let agentVersionId: string;

    if (body.agent_id) {
      const { data: agentRow } = await db
        .from('agents')
        .select('id, campaign_id')
        .eq('id', body.agent_id)
        .is('deleted_at', null)
        .single();

      if (!agentRow || agentRow.campaign_id !== body.campaign_id) {
        return new Response(JSON.stringify({ error: 'Agent does not belong to campaign' }), { status: 400 });
      }

      const version = await agentService.getActiveVersion(body.agent_id);
      if (!version) {
        return new Response(
          JSON.stringify({
            error: 'This agent has no published prompt version yet. Open the agent, add a prompt, and click Save Changes to publish version 1 — then start a debug session.',
          }),
          { status: 400 },
        );
      }

      agentId = agentRow.id;
      agentVersionId = version.id;
    } else {
      try {
        const selected = await agentService.selectForConversation(body.campaign_id);
        agentId = selected.agent.id;
        agentVersionId = selected.version.id;
      } catch (selectErr) {
        const msg = selectErr instanceof Error ? selectErr.message : '';
        if (msg.includes('published prompt version')) {
          return new Response(
            JSON.stringify({
              error: 'No agent in this campaign has a published prompt version yet. Add a prompt to an agent and save it, then start a debug session.',
            }),
            { status: 400 },
          );
        }
        if (msg.includes('No active agents')) {
          return new Response(
            JSON.stringify({ error: 'This campaign has no active agents. Add or activate an agent first.' }),
            { status: 400 },
          );
        }
        throw selectErr;
      }
    }

    // Synthetic phone — never used for dispatch, but the column is NOT NULL.
    // Use a clearly-fake range and add randomness to dodge any unique index.
    const syntheticPhone = body.lead.phone?.trim() || `+1999${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`;

    // When a CRM contact ID is supplied, resolve the workspace's active CRM
    // provider so qualify/book events sync to the real contact. Without an
    // external_contact_id, CRM sync is skipped (matches production behaviour).
    const externalContactId = body.lead.external_contact_id?.trim() || null;
    let crmProvider: string | null = null;
    if (externalContactId) {
      const { data: crmIntegration } = await db
        .from('integrations')
        .select('provider')
        .eq('workspace_id', access.workspace.id)
        .eq('type', 'crm')
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      if (!crmIntegration) {
        return new Response(
          JSON.stringify({ error: 'A CRM contact ID was provided but this workspace has no active CRM integration.' }),
          { status: 400 },
        );
      }
      crmProvider = crmIntegration.provider;
    }

    const { data: lead, error: leadError } = await db
      .from('leads')
      .insert({
        workspace_id: access.workspace.id,
        phone_e164: syntheticPhone,
        first_name: body.lead.first_name,
        last_name: body.lead.last_name ?? '',
        email: body.lead.email ?? null,
        timezone: body.lead.timezone ?? null,
        external_contact_id: externalContactId,
        crm_provider: crmProvider,
        status: EntityStatus.Active,
        is_test: true,
        source_json: { source: 'debug_chat', created_by: access.session.user_id },
      })
      .select()
      .single();

    if (leadError) {
      console.error('Failed to create debug lead:', leadError);
      return new Response(
        JSON.stringify({ error: `Failed to create debug lead: ${leadError.message}` }),
        { status: 500 },
      );
    }

    const conversationService = new ConversationService(db);
    const conversation = await conversationService.create({
      workspace_id: access.workspace.id,
      campaign_id: body.campaign_id,
      agent_id: agentId,
      agent_version_id: agentVersionId,
      lead_id: lead.id,
      is_test: true,
    });

    // Tag the conversation so debug sessions can be listed by creator.
    await db.from('conversation_events').insert({
      conversation_id: conversation.id,
      event_type: 'debug_session_started',
      event_payload_json: {
        created_by_user_id: access.session.user_id,
        created_by_email: access.session.email,
        session_token: nanoid(),
      },
    });

    // Default: AI sends the first outreach (mirrors webhook-start-conversation).
    // Caller can opt out by passing { ai_starts: false } to drive the
    // conversation from the lead side instead.
    const aiStarts = body.ai_starts !== false;
    if (aiStarts) {
      const queueService = new QueueService(db);
      await queueService.enqueue({
        workspace_id: access.workspace.id,
        job_type: 'generate_ai_reply',
        queue_name: 'ai',
        payload: {
          conversation_id: conversation.id,
          trigger: 'conversation_start',
        },
      });
    }

    return new Response(
      JSON.stringify({
        conversation_id: conversation.id,
        lead_id: lead.id,
        agent_id: agentId,
        agent_version_id: agentVersionId,
        ai_starts: aiStarts,
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('api-debug-conversation-create error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500 },
    );
  }
};
