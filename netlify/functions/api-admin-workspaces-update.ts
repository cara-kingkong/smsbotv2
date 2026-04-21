import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { requirePlatformAdmin } from '../../src/lib/auth/permissions';
import { EntityStatus } from '../../src/lib/types';

const VALID_STATUSES: EntityStatus[] = [
  EntityStatus.Active,
  EntityStatus.Paused,
  EntityStatus.Archived,
];

/**
 * Rename or change the status of a workspace. Platform admin only.
 * PATCH /.netlify/functions/api-admin-workspaces-update
 * Body: { workspace_id: string, name?: string, status?: EntityStatus }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'PATCH' && req.method !== 'PUT') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const auth = await requirePlatformAdmin(req);
  if (auth instanceof Response) return auth;

  let body: { workspace_id?: string; name?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  if (!body.workspace_id) {
    return new Response(JSON.stringify({ error: 'workspace_id is required' }), { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const trimmed = body.name.trim();
    if (!trimmed) {
      return new Response(JSON.stringify({ error: 'name cannot be empty' }), { status: 400 });
    }
    updates.name = trimmed;
  }
  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status as EntityStatus)) {
      return new Response(
        JSON.stringify({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }),
        { status: 400 },
      );
    }
    updates.status = body.status;
  }

  if (Object.keys(updates).length === 0) {
    return new Response(JSON.stringify({ error: 'No update fields provided' }), { status: 400 });
  }

  const db = getServiceClient();
  const { data, error } = await db
    .from('workspaces')
    .update(updates)
    .eq('id', body.workspace_id)
    .select()
    .single();

  if (error || !data) {
    console.error('api-admin-workspaces-update:', error);
    return new Response(JSON.stringify({ error: 'Workspace not found or update failed' }), { status: 404 });
  }

  return new Response(JSON.stringify({ workspace: data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
