import type { AuthSession } from './middleware';
import { getServiceClient } from '@lib/db/client';
import { EntityStatus, WorkspaceRole } from '@lib/types';

/**
 * Ensure the authenticated user has at least one workspace.
 * If not, creates a default personal workspace and assigns them as owner.
 *
 * Uses the service-role client to bypass RLS for provisioning.
 * Call this from protected pages after requireAuth().
 * Returns the user's first workspace ID.
 */
export async function ensureWorkspace(
  session: AuthSession,
): Promise<string> {
  if (!session.user_id) {
    throw new Error('ensureWorkspace called without a valid user_id');
  }

  const db = getServiceClient();
  const email = session.email || 'user';
  const emailPrefix = email.includes('@') ? email.split('@')[0] : email;

  const userId: string = session.user_id;

  // 1. Check if user already has a workspace (fast path — covers trigger-created ones)
  const { data: memberships } = await db
    .from('workspace_users')
    .select('workspace_id')
    .eq('user_id', userId)
    .limit(1);

  if (memberships && memberships.length > 0) {
    return memberships[0].workspace_id;
  }

  // 2. Ensure user record exists in public.users (may already exist from DB trigger)
  const { error: userError } = await db
    .from('users')
    .upsert(
      {
        id: userId,
        email,
        full_name: emailPrefix,
        auth_provider: 'google',
      },
      { onConflict: 'id', ignoreDuplicates: true },
    );

  if (userError) {
    console.error('ensureWorkspace: user upsert failed', { userId, email, error: userError.message });
    throw new Error(`Failed to upsert user: ${userError.message}`);
  }

  // 3. Create a default workspace
  const prefix = emailPrefix.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const slug = `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

  const { data: workspace, error: wsError } = await db
    .from('workspaces')
    .insert({
      name: `${emailPrefix}'s Workspace`,
      slug,
      status: EntityStatus.Active,
    })
    .select()
    .single();

  if (wsError || !workspace) {
    console.error('ensureWorkspace: workspace insert failed', { userId, error: wsError?.message });
    throw new Error(`Failed to create default workspace: ${wsError?.message}`);
  }

  // 4. Add user as owner
  const { error: memberError } = await db
    .from('workspace_users')
    .insert({
      workspace_id: workspace.id,
      user_id: userId,
      role: WorkspaceRole.Owner,
    });

  if (memberError) {
    console.error('ensureWorkspace: membership insert failed', { userId, workspaceId: workspace.id, error: memberError.message });
    throw new Error(`Failed to assign workspace ownership: ${memberError.message}`);
  }

  return workspace.id;
}
