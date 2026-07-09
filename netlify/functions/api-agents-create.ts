import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { AgentService, AgentServiceError } from '../../src/lib/agents/service';
import { CampaignService } from '../../src/lib/campaigns/service';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';
import { requireRole } from '../../src/lib/auth/permissions';
import { WorkspaceRole } from '../../src/lib/types';

/**
 * Create or duplicate an agent within a campaign.
 * POST /.netlify/functions/api-agents-create
 *
 * Normal create: { campaign_id, name, description?, weight?, ai_provider_integration_id? }
 * Duplicate:     { campaign_id, source_agent_id, name?, weight? }
 *
 * When source_agent_id is present, the request is treated as duplicate mode.
 * The source agent's active prompt version is copied; no historical versions are carried over.
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const body = await req.json();
    const { campaign_id, source_agent_id, name, description, weight, ai_provider_integration_id } = body;

    if (!campaign_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: campaign_id' }),
        { status: 400 },
      );
    }

    const campaignService = new CampaignService(db);
    const campaign = await campaignService.getById(campaign_id);
    if (!campaign) {
      return new Response(JSON.stringify({ error: 'Campaign not found' }), { status: 404 });
    }

    const access = await requireWorkspaceAccess(req, campaign.workspace_id);
    if (access instanceof Response) return access;
    const guard = requireRole(access, WorkspaceRole.Manager);
    if (guard instanceof Response) return guard;

    const agentService = new AgentService(db);

    if (source_agent_id) {
      // ── Duplicate mode ──────────────────────────────────────────────────────
      const agent = await agentService.duplicateToCampaign({
        source_agent_id,
        target_campaign_id: campaign_id,
        name: name ?? undefined,
        weight: weight ?? undefined,
      });

      return new Response(JSON.stringify(agent), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── Normal create mode ──────────────────────────────────────────────────
    if (!name) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: name' }),
        { status: 400 },
      );
    }

    if (ai_provider_integration_id) {
      const { data: integration, error: integrationError } = await db
        .from('integrations')
        .select('id, workspace_id')
        .eq('id', ai_provider_integration_id)
        .single();

      if (integrationError || !integration) {
        return new Response(JSON.stringify({ error: 'Integration not found' }), { status: 404 });
      }

      if (integration.workspace_id !== campaign.workspace_id) {
        return new Response(JSON.stringify({ error: 'Integration does not belong to this workspace' }), { status: 403 });
      }
    }

    const agent = await agentService.create({
      campaign_id,
      name,
      description,
      weight,
      ai_provider_integration_id,
    });

    return new Response(JSON.stringify(agent), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    if (err instanceof AgentServiceError) {
      const status = err.code === 'NOT_FOUND' ? 404
        : err.code === 'WORKSPACE_MISMATCH' ? 403
        : 409; // NO_ACTIVE_VERSION
      return new Response(JSON.stringify({ error: err.message }), { status });
    }
    console.error('api-agents-create error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
