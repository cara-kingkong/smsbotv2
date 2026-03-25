import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActivityLog } from '@lib/types';

export interface LogActivityInput {
  workspace_id: string;
  user_id?: string;
  entity_type: string;
  entity_id: string;
  action_type: string;
  metadata?: Record<string, unknown>;
}

export class AuditService {
  constructor(private readonly db: SupabaseClient) {}

  async log(input: LogActivityInput): Promise<ActivityLog> {
    const { data, error } = await this.db
      .from('activity_logs')
      .insert({
        workspace_id: input.workspace_id,
        user_id: input.user_id ?? null,
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        action_type: input.action_type,
        metadata_json: input.metadata ?? {},
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to log activity: ${error.message}`);
    return data;
  }

  async listByWorkspace(workspaceId: string, limit = 50): Promise<ActivityLog[]> {
    const { data, error } = await this.db
      .from('activity_logs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to list activity: ${error.message}`);
    return data ?? [];
  }

  async listByEntity(entityType: string, entityId: string): Promise<ActivityLog[]> {
    const { data, error } = await this.db
      .from('activity_logs')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to list entity activity: ${error.message}`);
    return data ?? [];
  }
}
