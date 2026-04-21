import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { requirePlatformAdmin } from '../../src/lib/auth/permissions';
import { EntityStatus, WorkspaceRole } from '../../src/lib/types';

/**
 * Create a workspace and assign a first owner by email. Platform admin only.
 * POST /.netlify/functions/api-admin-workspaces-create
 * Body: { name: string, slug?: string, owner_email: string }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const auth = await requirePlatformAdmin(req);
  if (auth instanceof Response) return auth;

  let body: { name?: string; slug?: string; owner_email?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const name = body.name?.trim();
  const ownerEmail = body.owner_email?.trim().toLowerCase();
  if (!name || !ownerEmail) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: name, owner_email' }),
      { status: 400 },
    );
  }

  const db = getServiceClient();

  // Verify the owner already exists in public.users (we only add-by-email).
  const { data: owner, error: ownerErr } = await db
    .from('users')
    .select('id')
    .eq('email', ownerEmail)
    .maybeSingle();

  if (ownerErr) {
    console.error('api-admin-workspaces-create owner lookup:', ownerErr);
    return new Response(JSON.stringify({ error: 'Failed to look up owner' }), { status: 500 });
  }

  if (!owner) {
    return new Response(
      JSON.stringify({ error: `No user found with email ${ownerEmail}. The user must sign in once before being assigned.` }),
      { status: 404 },
    );
  }

  const slug = (body.slug?.trim() || name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) + '-' + crypto.randomUUID().slice(0, 8);

  const { data: workspace, error: wsErr } = await db
    .from('workspaces')
    .insert({ name, slug, status: EntityStatus.Active })
    .select()
    .single();

  if (wsErr || !workspace) {
    console.error('api-admin-workspaces-create workspace insert:', wsErr);
    return new Response(JSON.stringify({ error: `Failed to create workspace: ${wsErr?.message ?? 'unknown'}` }), { status: 500 });
  }

  const { error: memberErr } = await db
    .from('workspace_users')
    .insert({ workspace_id: workspace.id, user_id: owner.id, role: WorkspaceRole.Owner });

  if (memberErr) {
    console.error('api-admin-workspaces-create membership insert:', memberErr);
    return new Response(JSON.stringify({ error: `Failed to assign owner: ${memberErr.message}` }), { status: 500 });
  }

  return new Response(JSON.stringify({ workspace, owner_user_id: owner.id }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
