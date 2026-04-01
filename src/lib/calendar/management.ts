import type { SupabaseClient } from '@supabase/supabase-js';
import type { Calendar, AgentCalendar } from '@lib/types';
import { CalendlyAdapter } from './adapters/calendly';

export interface CreateCalendarInput {
  workspace_id: string;
  integration_id: string;
  name: string;
  external_calendar_id?: string;
  booking_url?: string;
  eligibility_rules_json?: Record<string, unknown>;
}

export interface UpdateCalendarInput {
  name?: string;
  status?: string;
  eligibility_rules_json?: Record<string, unknown>;
  settings_json?: Record<string, unknown>;
}

export class CalendarManagementService {
  constructor(private readonly db: SupabaseClient) {}

  async listByWorkspace(workspaceId: string): Promise<Calendar[]> {
    const { data, error } = await this.db
      .from('calendars')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to list calendars: ${error.message}`);
    return data ?? [];
  }

  async create(input: CreateCalendarInput): Promise<Calendar> {
    const { data, error } = await this.db
      .from('calendars')
      .insert({
        workspace_id: input.workspace_id,
        integration_id: input.integration_id,
        name: input.name,
        external_calendar_id: input.external_calendar_id ?? null,
        booking_url: input.booking_url ?? null,
        eligibility_rules_json: input.eligibility_rules_json ?? {},
        status: 'active',
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create calendar: ${error.message}`);
    return data;
  }

  async update(id: string, updates: UpdateCalendarInput): Promise<Calendar> {
    const { data, error } = await this.db
      .from('calendars')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update calendar: ${error.message}`);
    return data;
  }

  async softDelete(id: string): Promise<void> {
    const { error } = await this.db
      .from('calendars')
      .update({
        deleted_at: new Date().toISOString(),
        status: 'archived',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw new Error(`Failed to delete calendar: ${error.message}`);
  }

  async listForAgent(agentId: string): Promise<Calendar[]> {
    const { data, error } = await this.db
      .from('agent_calendars')
      .select('calendar_id, calendars(*)')
      .eq('agent_id', agentId);

    if (error) throw new Error(`Failed to list agent calendars: ${error.message}`);
    return (data ?? []).map((row: Record<string, unknown>) => row.calendars as unknown as Calendar);
  }

  async assignToAgent(input: {
    workspace_id: string;
    agent_id: string;
    calendar_id: string;
  }): Promise<AgentCalendar> {
    const { data, error } = await this.db
      .from('agent_calendars')
      .insert({
        workspace_id: input.workspace_id,
        agent_id: input.agent_id,
        calendar_id: input.calendar_id,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('Calendar is already assigned to this agent');
      }
      throw new Error(`Failed to assign calendar: ${error.message}`);
    }
    return data;
  }

  async removeFromAgent(agentId: string, calendarId: string): Promise<void> {
    const { error } = await this.db
      .from('agent_calendars')
      .delete()
      .eq('agent_id', agentId)
      .eq('calendar_id', calendarId);

    if (error) throw new Error(`Failed to remove calendar assignment: ${error.message}`);
  }

  async fetchEventTypes(integrationId: string, options?: {
    search?: string;
    includeInactive?: boolean;
  }): Promise<Array<{
    uri: string;
    name: string;
    slug: string;
    scheduling_url: string;
    duration: number;
    active: boolean;
  }>> {
    const { data: integration, error } = await this.db
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .single();

    if (error || !integration) {
      throw new Error('Integration not found');
    }

    const config = integration.config_json as Record<string, unknown>;
    const apiKeyRef = String(config.api_key_ref ?? 'CALENDLY_API_KEY');
    const apiKey = process.env[apiKeyRef];

    if (!apiKey) {
      throw new Error(`Calendar API key not configured. Set the ${apiKeyRef} environment variable.`);
    }

    const adapter = new CalendlyAdapter(apiKey);
    return adapter.listEventTypes(options);
  }
}
