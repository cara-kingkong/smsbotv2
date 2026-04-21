import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { AgentService } from '../../src/lib/agents/service';
import { CampaignService } from '../../src/lib/campaigns/service';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';
import { requireRole } from '../../src/lib/auth/permissions';
import { WorkspaceRole } from '../../src/lib/types';

/**
 * Create an agent within a campaign.
 * POST /.netlify/functions/api-agents-create
 *
 * Body: { campaign_id, name, weight?, ai_provider_integration_id? }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const body = await req.json();
    const { campaign_id, name, description, weight, ai_provider_integration_id } = body;

    if (!campaign_id || !name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: campaign_id, name' }),
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

    const agentService = new AgentService(db);
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
    console.error('api-agents-create error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
