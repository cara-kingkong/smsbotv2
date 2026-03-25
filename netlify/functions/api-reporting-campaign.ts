import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { ReportingService } from '../../src/lib/reporting/service';

/**
 * Fetch split-test campaign metrics with per-agent breakdowns.
 * GET /.netlify/functions/api-reporting-campaign?campaign_id=...
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

    const reportingService = new ReportingService(db);
    const metrics = await reportingService.getCampaignMetrics(campaignId);

    if (!metrics) {
      return new Response(JSON.stringify({ error: 'Campaign not found' }), { status: 404 });
    }

    return new Response(JSON.stringify(metrics), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-reporting-campaign error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
