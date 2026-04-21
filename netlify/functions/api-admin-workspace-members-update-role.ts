import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { requirePlatformAdmin } from '../../src/lib/auth/permissions';
import { WorkspaceRole } from '../../src/lib/types';

const VALID_ROLES: WorkspaceRole[] = [
  WorkspaceRole.Owner,
  WorkspaceRole.Admin,
  WorkspaceRole.Manager,
  WorkspaceRole.ReadOnly,
];

/**
 * Update a member's role within a workspace. Platform admin only.
 * PATCH /.netlify/functions/api-admin-workspace-members-update-role
 * Body: { workspace_id: string, user_id: string, role: WorkspaceRole }
 *
 * Refuses to demote the last owner (promote another first).
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'PATCH' && req.method !== 'PUT') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const auth = await requirePlatformAdmin(req);
  if (auth instanceof Response) return auth;

  let body: { workspace_id?: string; user_id?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { workspace_id, user_id } = body;
  const role = body.role as WorkspaceRole | undefined;

  if (!workspace_id || !user_id || !role) {
    return new Response(JSON.stringify({ error: 'workspace_id, user_id, and role are required' }), { status: 400 });
  }
  if (!VALID_ROLES.includes(role)) {
    return new Response(JSON.stringify({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }), { status: 400 });
  }

  const db = getServiceClient();

  const { data: target, error: findErr } = await db
    .from('workspace_users')
    .select('id, role')
    .eq('workspace_id', workspace_id)
    .eq('user_id', user_id)
    .maybeSingle();

  if (findErr) {
    console.error('api-admin-workspace-members-update-role find:', findErr);
    return new Response(JSON.stringify({ error: 'Failed to find membership' }), { status: 500 });
  }
  if (!target) {
    return new Response(JSON.stringify({ error: 'Membership not found' }), { status: 404 });
  }

  if (target.role === role) {
    return new Response(JSON.stringify({ membership: target }), { status: 200 });
  }

  // Protect last owner when demoting
  if (target.role === WorkspaceRole.Owner && role !== WorkspaceRole.Owner) {
    const { count } = await db
      .from('workspace_users')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspace_id)
      .eq('role', WorkspaceRole.Owner);
    if ((count ?? 0) <= 1) {
      return new Response(
        JSON.stringify({ error: 'Cannot demote the last owner. Promote another member to owner first.' }),
        { status: 409 },
      );
    }
  }

  const { data, error: updErr } = await db
    .from('workspace_users')
    .update({ role })
    .eq('id', target.id)
    .select()
    .single();

  if (updErr) {
    console.error('api-admin-workspace-members-update-role update:', updErr);
    return new Response(JSON.stringify({ error: `Failed to update role: ${updErr.message}` }), { status: 500 });
  }

  return new Response(JSON.stringify({ membership: data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
