import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { CampaignService } from '../../src/lib/campaigns/service';
import { AgentService } from '../../src/lib/agents/service';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

/**
 * Get a single campaign by ID, including its agents.
 * GET /.netlify/functions/api-campaigns-get?campaign_id=...
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const url = new URL(req.url);
    const campaignId = url.searchParams.get('campaign_id');

    if (!campaignId) {
      return new Response(JSON.stringify({ error: 'campaign_id is required' }), { status: 400 });
    }

    const campaignService = new CampaignService(db);
    const campaign = await campaignService.getById(campaignId);

    if (!campaign) {
      return new Response(JSON.stringify({ error: 'Campaign not found' }), { status: 404 });
    }

    const access = await requireWorkspaceAccess(req, campaign.workspace_id);
    if (access instanceof Response) return access;

    const agentService = new AgentService(db);
    const agents = await agentService.listByCampaign(campaignId);

    return new Response(JSON.stringify({ ...campaign, agents }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-campaigns-get error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
