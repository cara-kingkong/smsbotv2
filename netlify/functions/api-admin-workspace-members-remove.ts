import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { requirePlatformAdmin } from '../../src/lib/auth/permissions';
import { WorkspaceRole } from '../../src/lib/types';

/**
 * Remove a user from a workspace. Platform admin only.
 * DELETE /.netlify/functions/api-admin-workspace-members-remove
 * Body: { workspace_id: string, user_id: string }
 *
 * Refuses to remove the last owner — platform admins must promote someone
 * else first to avoid leaving the workspace ownerless.
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const auth = await requirePlatformAdmin(req);
  if (auth instanceof Response) return auth;

  let body: { workspace_id?: string; user_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { workspace_id, user_id } = body;
  if (!workspace_id || !user_id) {
    return new Response(JSON.stringify({ error: 'workspace_id and user_id are required' }), { status: 400 });
  }

  const db = getServiceClient();

  const { data: target, error: findErr } = await db
    .from('workspace_users')
    .select('id, role')
    .eq('workspace_id', workspace_id)
    .eq('user_id', user_id)
    .maybeSingle();

  if (findErr) {
    console.error('api-admin-workspace-members-remove find:', findErr);
    return new Response(JSON.stringify({ error: 'Failed to find membership' }), { status: 500 });
  }
  if (!target) {
    return new Response(JSON.stringify({ error: 'Membership not found' }), { status: 404 });
  }

  if (target.role === WorkspaceRole.Owner) {
    const { count } = await db
      .from('workspace_users')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspace_id)
      .eq('role', WorkspaceRole.Owner);

    if ((count ?? 0) <= 1) {
      return new Response(
        JSON.stringify({ error: 'Cannot remove the last owner. Promote another member to owner first.' }),
        { status: 409 },
      );
    }
  }

  const { error: delErr } = await db
    .from('workspace_users')
    .delete()
    .eq('id', target.id);

  if (delErr) {
    console.error('api-admin-workspace-members-remove delete:', delErr);
    return new Response(JSON.stringify({ error: `Failed to remove member: ${delErr.message}` }), { status: 500 });
  }

  return new Response(JSON.stringify({ removed: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
