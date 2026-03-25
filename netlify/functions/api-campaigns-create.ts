import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { CampaignService } from '../../src/lib/campaigns/service';

/**
 * Create a campaign within a workspace.
 * POST /.netlify/functions/api-campaigns-create
 *
 * Body: { workspace_id, name, business_hours_json?, stop_conditions_json? }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const body = await req.json();
    const { workspace_id, name, business_hours_json, stop_conditions_json } = body;

    if (!workspace_id || !name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: workspace_id, name' }),
        { status: 400 },
      );
    }

    // Validate workspace exists
    const { data: workspace, error: wsError } = await db
      .from('workspaces')
      .select('id')
      .eq('id', workspace_id)
      .single();

    if (wsError || !workspace) {
      return new Response(JSON.stringify({ error: 'Workspace not found' }), { status: 404 });
    }

    const campaignService = new CampaignService(db);
    const campaign = await campaignService.create({
      workspace_id,
      name,
      business_hours_json,
      stop_conditions_json,
    });

    return new Response(JSON.stringify(campaign), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-campaigns-create error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
