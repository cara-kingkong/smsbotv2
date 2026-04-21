import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { requirePlatformAdmin } from '../../src/lib/auth/permissions';

/**
 * List every workspace on the platform (including deleted) with member count.
 * GET /.netlify/functions/api-admin-workspaces-list
 *
 * Platform admin only.
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const auth = await requirePlatformAdmin(req);
  if (auth instanceof Response) return auth;

  const db = getServiceClient();
  const { data, error } = await db
    .from('workspaces')
    .select('id, name, slug, status, created_at, updated_at, deleted_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('api-admin-workspaces-list error:', error);
    return new Response(JSON.stringify({ error: 'Failed to list workspaces' }), { status: 500 });
  }

  // Hydrate member counts in a second query (avoids N+1 joins)
  const ids = (data ?? []).map((w) => w.id);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: memberRows } = await db
      .from('workspace_users')
      .select('workspace_id')
      .in('workspace_id', ids);
    for (const row of memberRows ?? []) {
      counts.set(row.workspace_id, (counts.get(row.workspace_id) ?? 0) + 1);
    }
  }

  const workspaces = (data ?? []).map((w) => ({
    ...w,
    member_count: counts.get(w.id) ?? 0,
  }));

  return new Response(JSON.stringify({ workspaces }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
