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
 * Add a user to a workspace by email. Platform admin only.
 * POST /.netlify/functions/api-admin-workspace-members-add
 * Body: { workspace_id: string, email: string, role?: WorkspaceRole }
 *
 * The user must already exist in public.users (i.e. must have signed in once).
 * Returns 409 if the membership already exists.
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const auth = await requirePlatformAdmin(req);
  if (auth instanceof Response) return auth;

  let body: { workspace_id?: string; email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const workspaceId = body.workspace_id;
  const email = body.email?.trim().toLowerCase();
  const role = (body.role as WorkspaceRole) ?? WorkspaceRole.Manager;

  if (!workspaceId || !email) {
    return new Response(JSON.stringify({ error: 'Missing required fields: workspace_id, email' }), { status: 400 });
  }
  if (!VALID_ROLES.includes(role)) {
    return new Response(JSON.stringify({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` }), { status: 400 });
  }

  const db = getServiceClient();

  const { data: user, error: userErr } = await db
    .from('users')
    .select('id, email, full_name')
    .eq('email', email)
    .maybeSingle();

  if (userErr) {
    console.error('api-admin-workspace-members-add user lookup:', userErr);
    return new Response(JSON.stringify({ error: 'Failed to look up user' }), { status: 500 });
  }

  if (!user) {
    return new Response(
      JSON.stringify({ error: `No user found with email ${email}. The user must sign in once before being added.` }),
      { status: 404 },
    );
  }

  // Ensure workspace exists and isn't deleted
  const { data: workspace } = await db
    .from('workspaces')
    .select('id')
    .eq('id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!workspace) {
    return new Response(JSON.stringify({ error: 'Workspace not found' }), { status: 404 });
  }

  const { data: membership, error: memberErr } = await db
    .from('workspace_users')
    .insert({ workspace_id: workspaceId, user_id: user.id, role })
    .select()
    .single();

  if (memberErr) {
    // Unique constraint (workspace_id, user_id)
    if (memberErr.code === '23505') {
      return new Response(JSON.stringify({ error: 'User is already a member of this workspace' }), { status: 409 });
    }
    console.error('api-admin-workspace-members-add insert:', memberErr);
    return new Response(JSON.stringify({ error: `Failed to add member: ${memberErr.message}` }), { status: 500 });
  }

  return new Response(JSON.stringify({
    membership,
    user: { id: user.id, email: user.email, full_name: user.full_name },
  }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
