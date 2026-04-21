import type { AstroGlobal } from 'astro';
import type { AuthSession } from './middleware';
import { getServiceClient } from '@lib/db/client';
import { EntityStatus, WorkspaceRole } from '@lib/types';

export const ACTIVE_WORKSPACE_COOKIE = 'kong-active-workspace';

export interface ResolvedWorkspace {
  id: string;
  name: string;
  role: WorkspaceRole;
}

export interface WorkspaceContext {
  activeWorkspaceId: string;
  activeRole: WorkspaceRole;
  availableWorkspaces: ResolvedWorkspace[];
  isPlatformAdmin: boolean;
}

/**
 * Ensure the authenticated user has at least one workspace and resolve the
 * active workspace from the cookie (falling back to the first membership).
 *
 * Returns the active workspace id along with all memberships the user has and
 * whether the user is a platform admin — all the context the layout needs to
 * render the switcher and conditional admin nav.
 *
 * Uses the service-role client to bypass RLS. Creates a personal workspace
 * for brand-new users (this is a safety net; the DB trigger
 * `handle_new_user` usually handles it).
 */
export async function resolveWorkspaceContext(
  session: AuthSession,
  Astro: AstroGlobal,
): Promise<WorkspaceContext> {
  if (!session.user_id) {
    throw new Error('resolveWorkspaceContext called without a valid user_id');
  }

  const db = getServiceClient();
  const userId: string = session.user_id;

  const [memberships, userRecord] = await Promise.all([
    db
      .from('workspace_users')
      .select('role, workspaces!inner(id, name, deleted_at)')
      .eq('user_id', userId),
    db
      .from('users')
      .select('is_platform_admin')
      .eq('id', userId)
      .single(),
  ]);

  let availableWorkspaces: ResolvedWorkspace[] = (memberships.data ?? [])
    .map((row: Record<string, unknown>) => {
      const ws = row.workspaces as { id: string; name: string; deleted_at: string | null };
      return {
        id: ws.id,
        name: ws.name,
        role: row.role as WorkspaceRole,
        deletedAt: ws.deleted_at,
      };
    })
    .filter((ws) => !ws.deletedAt)
    .map(({ id, name, role }) => ({ id, name, role }));

  // New user safety net — the DB trigger should have provisioned, but if it
  // didn't for some reason, bootstrap a personal workspace here.
  if (availableWorkspaces.length === 0) {
    const bootstrapped = await bootstrapPersonalWorkspace(session);
    availableWorkspaces = [bootstrapped];
  }

  const cookieWorkspaceId = Astro.cookies.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const fromCookie = cookieWorkspaceId
    ? availableWorkspaces.find((ws) => ws.id === cookieWorkspaceId)
    : undefined;
  const active = fromCookie ?? availableWorkspaces[0];

  // If the cookie pointed at a workspace the user no longer belongs to
  // (e.g. removed by a platform admin), refresh it to the valid fallback.
  if (!fromCookie && cookieWorkspaceId && active) {
    const isSecure = Astro.url.protocol === 'https:';
    Astro.cookies.set(ACTIVE_WORKSPACE_COOKIE, active.id, {
      path: '/',
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    });
  }

  return {
    activeWorkspaceId: active.id,
    activeRole: active.role,
    availableWorkspaces,
    isPlatformAdmin: Boolean(userRecord.data?.is_platform_admin),
  };
}

async function bootstrapPersonalWorkspace(
  session: AuthSession,
): Promise<ResolvedWorkspace> {
  const db = getServiceClient();
  const email = session.email || 'user';
  const emailPrefix = email.includes('@') ? email.split('@')[0] : email;

  await db
    .from('users')
    .upsert(
      {
        id: session.user_id,
        email,
        full_name: emailPrefix,
        auth_provider: 'google',
      },
      { onConflict: 'id', ignoreDuplicates: true },
    );

  const prefix = emailPrefix.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const slug = `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

  const { data: workspace, error: wsError } = await db
    .from('workspaces')
    .insert({
      name: `${emailPrefix}'s Workspace`,
      slug,
      status: EntityStatus.Active,
    })
    .select('id, name')
    .single();

  if (wsError || !workspace) {
    throw new Error(`Failed to create default workspace: ${wsError?.message}`);
  }

  const { error: memberError } = await db
    .from('workspace_users')
    .insert({
      workspace_id: workspace.id,
      user_id: session.user_id,
      role: WorkspaceRole.Owner,
    });

  if (memberError) {
    throw new Error(`Failed to assign workspace ownership: ${memberError.message}`);
  }

  return { id: workspace.id, name: workspace.name, role: WorkspaceRole.Owner };
}

/**
 * Legacy signature kept for callers that only need the active workspace id.
 * Prefer `resolveWorkspaceContext` in new code.
 */
export async function ensureWorkspace(
  session: AuthSession,
  Astro?: AstroGlobal,
): Promise<string> {
  if (Astro) {
    const ctx = await resolveWorkspaceContext(session, Astro);
    return ctx.activeWorkspaceId;
  }

  // Astro-less fallback: just return the first membership (pre-switcher
  // behaviour). Used only by legacy call sites that haven't been updated.
  const db = getServiceClient();
  const { data } = await db
    .from('workspace_users')
    .select('workspace_id')
    .eq('user_id', session.user_id)
    .limit(1);

  if (data && data.length > 0) return data[0].workspace_id;

  const bootstrapped = await bootstrapPersonalWorkspace(session);
  return bootstrapped.id;
}
