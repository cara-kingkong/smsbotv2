import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { CampaignService } from '../../src/lib/campaigns/service';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

/**
 * Update a campaign.
 * PUT /.netlify/functions/api-campaigns-update
 *
 * Body: { campaign_id, name?, status?, business_hours_json?, stop_conditions_json? }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'PUT') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const body = await req.json();
    const { campaign_id, name, status, business_hours_json, stop_conditions_json } = body;

    if (!campaign_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: campaign_id' }),
        { status: 400 },
      );
    }

    // Build updates object with only provided fields
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (status !== undefined) updates.status = status;
    if (business_hours_json !== undefined) updates.business_hours_json = business_hours_json;
    if (stop_conditions_json !== undefined) updates.stop_conditions_json = stop_conditions_json;

    if (Object.keys(updates).length === 0) {
      return new Response(
        JSON.stringify({ error: 'No update fields provided' }),
        { status: 400 },
      );
    }

    const campaignService = new CampaignService(db);
    const existingCampaign = await campaignService.getById(campaign_id);
    if (!existingCampaign) {
      return new Response(JSON.stringify({ error: 'Campaign not found' }), { status: 404 });
    }

    const access = await requireWorkspaceAccess(req, existingCampaign.workspace_id);
    if (access instanceof Response) return access;

    const campaign = await campaignService.update(campaign_id, updates);

    return new Response(JSON.stringify(campaign), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-campaigns-update error:', err);
    const message = err instanceof Error ? err.message : 'Internal error';

    if (message.includes('Failed to update campaign')) {
      return new Response(JSON.stringify({ error: 'Campaign not found or update failed' }), { status: 404 });
    }

    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
