import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { CampaignService } from '../../src/lib/campaigns/service';

/**
 * List campaigns for a workspace.
 * GET /.netlify/functions/api-campaigns-list?workspace_id=...&status=...
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get('workspace_id');

    if (!workspaceId) {
      return new Response(JSON.stringify({ error: 'workspace_id is required' }), { status: 400 });
    }

    const campaignService = new CampaignService(db);
    let campaigns = await campaignService.listByWorkspace(workspaceId);

    const status = url.searchParams.get('status');
    if (status) {
      campaigns = campaigns.filter((c) => c.status === status);
    }

    return new Response(JSON.stringify(campaigns), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-campaigns-list error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
