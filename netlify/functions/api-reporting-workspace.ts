import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { ReportingService } from '../../src/lib/reporting/service';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

/**
 * Fetch full workspace reporting: workspace-level metrics plus per-campaign
 * split-test breakdowns in a single call.
 *
 * Optimised: uses getFullWorkspaceReport() which runs 3 parallel queries
 * instead of the old N+1 pattern (1 + 3 per campaign).
 *
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
    const report = await reportingService.getFullWorkspaceReport(access.workspace.id);

    return new Response(JSON.stringify(report), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=10, stale-while-revalidate=30',
      },
    });
  } catch (err) {
    console.error('api-reporting-workspace error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
