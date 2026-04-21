import { getServiceClient } from '@lib/db/client';
import { WorkspaceRole } from '@lib/types';
import type { WorkspaceAccess, RequestSession } from './request';
import { getRequestSession } from './request';

/**
 * Role hierarchy for workspace-scoped permission checks.
 * Higher number = more privileged.
 */
const ROLE_RANK: Record<WorkspaceRole, number> = {
  [WorkspaceRole.ReadOnly]: 0,
  [WorkspaceRole.Manager]: 1,
  [WorkspaceRole.Admin]: 2,
  [WorkspaceRole.Owner]: 3,
};

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Returns true if the member's role meets or exceeds `min`.
 */
export function hasRole(role: WorkspaceRole, min: WorkspaceRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/**
 * Guard that enforces a minimum role on a `WorkspaceAccess` returned by
 * `requireWorkspaceAccess`. Returns the access object when the role is
 * sufficient, otherwise a 403 Response.
 */
export function requireRole(
  access: WorkspaceAccess,
  min: WorkspaceRole,
): WorkspaceAccess | Response {
  if (!hasRole(access.membership.role, min)) {
    return jsonError(403, `Requires ${min} role or higher`);
  }
  return access;
}

export interface PlatformAdminSession extends RequestSession {
  is_platform_admin: true;
}

/**
 * Guard for platform-admin-only endpoints. Authenticates the request,
 * then verifies the user has `is_platform_admin = true` in `public.users`.
 */
export async function requirePlatformAdmin(
  req: Request,
): Promise<PlatformAdminSession | Response> {
  const session = await getRequestSession(req);
  if (!session) return jsonError(401, 'Authentication required');

  const db = getServiceClient();
  const { data, error } = await db
    .from('users')
    .select('is_platform_admin')
    .eq('id', session.user_id)
    .single();

  if (error || !data?.is_platform_admin) {
    return jsonError(403, 'Platform admin privileges required');
  }

  return { ...session, is_platform_admin: true };
}

/**
 * Check whether a given user is a platform admin. Useful for rendering
 * server-side UI (nav links, buttons) without throwing.
 */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const db = getServiceClient();
  const { data } = await db
    .from('users')
    .select('is_platform_admin')
    .eq('id', userId)
    .single();
  return Boolean(data?.is_platform_admin);
}
