import type { Workspace, WorkspaceUser } from '@lib/types';
import { getServiceClient, getSupabaseClient } from '@lib/db/client';
import { WorkspaceService } from '@lib/workspaces/service';

export interface RequestSession {
  user_id: string;
  email: string;
  access_token: string;
}

export interface WorkspaceAccess {
  session: RequestSession;
  workspace: Workspace;
  membership: WorkspaceUser;
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getAccessToken(req: Request): string | null {
  const authorization = req.headers.get('authorization');
  if (authorization?.startsWith('Bearer ')) {
    const token = authorization.slice('Bearer '.length).trim();
    if (token) return token;
  }

  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) return null;

  for (const cookie of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = cookie.trim().split('=');
    if (rawName === 'sb-access-token') {
      const value = rawValue.join('=').trim();
      return value ? decodeURIComponent(value) : null;
    }
  }

  return null;
}

export async function getRequestSession(req: Request): Promise<RequestSession | null> {
  const accessToken = getAccessToken(req);
  if (!accessToken) return null;

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) return null;

  return {
    user_id: data.user.id,
    email: data.user.email ?? '',
    access_token: accessToken,
  };
}

export async function requireRequestSession(req: Request): Promise<RequestSession | Response> {
  const session = await getRequestSession(req);
  if (!session) {
    return jsonError(401, 'Authentication required');
  }

  return session;
}

export async function requireWorkspaceAccess(
  req: Request,
  workspaceId: string | null | undefined,
): Promise<WorkspaceAccess | Response> {
  if (!workspaceId) {
    return jsonError(400, 'workspace_id is required');
  }

  const session = await getRequestSession(req);
  if (!session) {
    return jsonError(401, 'Authentication required');
  }

  const db = getServiceClient();
  const workspaceService = new WorkspaceService(db);

  const workspace = await workspaceService.getById(workspaceId);
  if (!workspace) {
    return jsonError(404, 'Workspace not found');
  }

  const membership = await workspaceService.getMembership(workspaceId, session.user_id);
  if (!membership) {
    return jsonError(403, 'Forbidden');
  }

  return { session, workspace, membership };
}
