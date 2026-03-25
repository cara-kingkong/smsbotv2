import type { SupabaseClient } from '@supabase/supabase-js';
import type { Workspace, WorkspaceUser } from '@lib/types';
import { EntityStatus, WorkspaceRole } from '@lib/types';

export class WorkspaceService {
  constructor(private readonly db: SupabaseClient) {}

  async create(input: { name: string; slug: string }): Promise<Workspace> {
    const { data, error } = await this.db
      .from('workspaces')
      .insert({ name: input.name, slug: input.slug, status: EntityStatus.Active })
      .select()
      .single();

    if (error) throw new Error(`Failed to create workspace: ${error.message}`);
    return data;
  }

  async getById(id: string): Promise<Workspace | null> {
    const { data, error } = await this.db
      .from('workspaces')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) return null;
    return data;
  }

  async listForUser(userId: string): Promise<Workspace[]> {
    const { data, error } = await this.db
      .from('workspace_users')
      .select('workspace_id, workspaces(*)')
      .eq('user_id', userId);

    if (error) throw new Error(`Failed to list workspaces: ${error.message}`);
    return (data ?? []).map((row: Record<string, unknown>) => row.workspaces as unknown as Workspace);
  }

  async addMember(workspaceId: string, userId: string, role: WorkspaceRole = WorkspaceRole.Admin): Promise<WorkspaceUser> {
    const { data, error } = await this.db
      .from('workspace_users')
      .insert({ workspace_id: workspaceId, user_id: userId, role })
      .select()
      .single();

    if (error) throw new Error(`Failed to add member: ${error.message}`);
    return data;
  }

  async getMembership(workspaceId: string, userId: string): Promise<WorkspaceUser | null> {
    const { data, error } = await this.db
      .from('workspace_users')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single();

    if (error) return null;
    return data;
  }
}
