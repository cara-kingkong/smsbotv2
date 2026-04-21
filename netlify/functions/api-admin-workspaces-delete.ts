import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { requirePlatformAdmin } from '../../src/lib/auth/permissions';

/**
 * Soft-delete a workspace. Platform admin only.
 * DELETE /.netlify/functions/api-admin-workspaces-delete
 * Body: { workspace_id: string }
 *
 * Sets `deleted_at`. Memberships remain in place so a workspace can be
 * restored later by clearing `deleted_at` (no restore endpoint yet — use SQL).
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const auth = await requirePlatformAdmin(req);
  if (auth instanceof Response) return auth;

  let body: { workspace_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  if (!body.workspace_id) {
    return new Response(JSON.stringify({ error: 'workspace_id is required' }), { status: 400 });
  }

  const db = getServiceClient();
  const { data, error } = await db
    .from('workspaces')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', body.workspace_id)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('api-admin-workspaces-delete:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete workspace' }), { status: 500 });
  }

  if (!data) {
    return new Response(JSON.stringify({ error: 'Workspace not found or already deleted' }), { status: 404 });
  }

  return new Response(JSON.stringify({ workspace_id: data.id, deleted: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
