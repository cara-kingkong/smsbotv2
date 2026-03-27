import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { ReportingService } from '../../src/lib/reporting/service';
import type { CampaignMetrics } from '../../src/lib/reporting/service';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

/**
 * Fetch full workspace reporting: workspace-level metrics plus per-campaign
 * split-test breakdowns in a single call.
 * GET /.netlify/functions/api-reporting-workspace?workspace_id=...
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get('workspace_id');
    const access = await requireWorkspaceAccess(req, workspaceId);
    if (access instanceof Response) return access;

    const reportingService = new ReportingService(db);

    // Fetch workspace-level metrics
    const workspaceMetrics = await reportingService.getWorkspaceMetrics(access.workspace.id);

    // Fetch all campaigns for this workspace
    const { data: campaigns, error } = await db
      .from('campaigns')
      .select('id')
      .eq('workspace_id', access.workspace.id)
      .is('deleted_at', null);

    if (error) throw new Error(`Failed to fetch campaigns: ${error.message}`);

    // Fetch metrics for each campaign in parallel
    const campaignIds = (campaigns ?? []).map((c) => c.id);
    const campaignMetricsResults = await Promise.all(
      campaignIds.map((id) => reportingService.getCampaignMetrics(id)),
    );

    // Filter out nulls (shouldn't happen, but be safe)
    const campaignMetrics: CampaignMetrics[] = campaignMetricsResults.filter(
      (m): m is CampaignMetrics => m !== null,
    );

    return new Response(
      JSON.stringify({
        workspace_metrics: workspaceMetrics,
        campaigns: campaignMetrics,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    console.error('api-reporting-workspace error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
