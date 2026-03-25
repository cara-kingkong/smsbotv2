import type { SupabaseClient } from '@supabase/supabase-js';
import type { Integration } from '@lib/types';
import { IntegrationType, IntegrationProvider, EntityStatus } from '@lib/types';

export interface CreateIntegrationInput {
  workspace_id: string;
  type: IntegrationType;
  provider: IntegrationProvider;
  name: string;
  config_json: Record<string, unknown>;
}

export class IntegrationService {
  constructor(private readonly db: SupabaseClient) {}

  async create(input: CreateIntegrationInput): Promise<Integration> {
    const { data, error } = await this.db
      .from('integrations')
      .insert({
        workspace_id: input.workspace_id,
        type: input.type,
        provider: input.provider,
        name: input.name,
        status: EntityStatus.Active,
        config_json: input.config_json,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create integration: ${error.message}`);
    return data;
  }

  async getById(id: string): Promise<Integration | null> {
    const { data, error } = await this.db
      .from('integrations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) return null;
    return data;
  }

  async listByWorkspace(workspaceId: string, type?: IntegrationType): Promise<Integration[]> {
    let query = this.db
      .from('integrations')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('status', EntityStatus.Active);

    if (type) query = query.eq('type', type);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to list integrations: ${error.message}`);
    return data ?? [];
  }

  async update(id: string, updates: Partial<Pick<Integration, 'name' | 'status' | 'config_json'>>): Promise<Integration> {
    const { data, error } = await this.db
      .from('integrations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update integration: ${error.message}`);
    return data;
  }
}
