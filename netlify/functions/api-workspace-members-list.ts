import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

/**
 * List members of a workspace. Any workspace member can read.
 * GET /.netlify/functions/api-workspace-members-list?workspace_id=...
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const url = new URL(req.url);
  const workspaceId = url.searchParams.get('workspace_id');

  const access = await requireWorkspaceAccess(req, workspaceId);
  if (access instanceof Response) return access;

  const db = getServiceClient();
  const { data, error } = await db
    .from('workspace_users')
    .select('id, role, created_at, users!inner(id, email, full_name, is_platform_admin)')
    .eq('workspace_id', access.workspace.id)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('api-workspace-members-list error:', error);
    return new Response(JSON.stringify({ error: 'Failed to list members' }), { status: 500 });
  }

  const members = (data ?? []).map((row: Record<string, unknown>) => {
    const user = row.users as { id: string; email: string; full_name: string; is_platform_admin: boolean };
    return {
      membership_id: row.id,
      role: row.role,
      created_at: row.created_at,
      user_id: user.id,
      email: user.email,
      full_name: user.full_name,
      is_platform_admin: user.is_platform_admin,
    };
  });

  return new Response(JSON.stringify({ members }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
