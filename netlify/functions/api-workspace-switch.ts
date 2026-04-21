import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { getRequestSession } from '../../src/lib/auth/request';
import { ACTIVE_WORKSPACE_COOKIE } from '../../src/lib/auth/ensure-workspace';

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * Set the active workspace for the current session.
 * POST /.netlify/functions/api-workspace-switch
 * Body: { workspace_id: string }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const session = await getRequestSession(req);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 });
  }

  let workspaceId: string | undefined;
  try {
    const body = (await req.json()) as { workspace_id?: string };
    workspaceId = body.workspace_id;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  if (!workspaceId) {
    return new Response(JSON.stringify({ error: 'workspace_id is required' }), { status: 400 });
  }

  // Verify the user is actually a member of the requested workspace.
  const db = getServiceClient();
  const { data: membership, error } = await db
    .from('workspace_users')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', session.user_id)
    .maybeSingle();

  if (error || !membership) {
    return new Response(JSON.stringify({ error: 'Not a member of that workspace' }), { status: 403 });
  }

  const isSecure = new URL(req.url).protocol === 'https:';
  const cookie = [
    `${ACTIVE_WORKSPACE_COOKIE}=${workspaceId}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    isSecure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');

  return new Response(JSON.stringify({ workspace_id: workspaceId }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': cookie,
    },
  });
};
