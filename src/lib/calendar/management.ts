import type { SupabaseClient } from '@supabase/supabase-js';
import type { Calendar, AgentCalendar, CampaignCalendar } from '@lib/types';
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

/** Check if a Supabase error is a missing-column error */
function isMissingColumn(error: { message: string }): boolean {
  return error.message.includes('does not exist');
}

export class CalendarManagementService {
  constructor(private readonly db: SupabaseClient) {}

  async listByWorkspace(workspaceId: string): Promise<Calendar[]> {
    // Try with deleted_at filter first; fall back if column doesn't exist yet
    const query = this.db
      .from('calendars')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error && isMissingColumn(error)) {
      const fallback = await this.db
        .from('calendars')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (fallback.error) throw new Error(`Failed to list calendars: ${fallback.error.message}`);
      return fallback.data ?? [];
    }

    if (error) throw new Error(`Failed to list calendars: ${error.message}`);
    return data ?? [];
  }

  async create(input: CreateCalendarInput): Promise<Calendar> {
    const row: Record<string, unknown> = {
      workspace_id: input.workspace_id,
      integration_id: input.integration_id,
      name: input.name,
      booking_url: input.booking_url ?? '',
      eligibility_rules_json: input.eligibility_rules_json ?? {},
      status: 'active',
    };

    // Only include columns that may not exist yet if we have values
    if (input.external_calendar_id) row.external_calendar_id = input.external_calendar_id;

    const { data, error } = await this.db
      .from('calendars')
      .insert(row)
      .select()
      .single();

    if (error && isMissingColumn(error)) {
      // Retry without optional columns
      const minimalRow: Record<string, unknown> = {
        workspace_id: input.workspace_id,
        integration_id: input.integration_id,
        name: input.name,
        booking_url: input.booking_url ?? '',
        eligibility_rules_json: input.eligibility_rules_json ?? {},
        status: 'active',
      };

      const retry = await this.db
        .from('calendars')
        .insert(minimalRow)
        .select()
        .single();

      if (retry.error) throw new Error(`Failed to create calendar: ${retry.error.message}`);
      return retry.data;
    }

    if (error) throw new Error(`Failed to create calendar: ${error.message}`);
    return data;
  }

  async update(id: string, updates: UpdateCalendarInput): Promise<Calendar> {
    const payload: Record<string, unknown> = { ...updates };

    // Try with updated_at; if column missing, retry without
    payload.updated_at = new Date().toISOString();

    const { data, error } = await this.db
      .from('calendars')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error && isMissingColumn(error)) {
      delete payload.updated_at;
      delete payload.settings_json;
      const retry = await this.db
        .from('calendars')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (retry.error) throw new Error(`Failed to update calendar: ${retry.error.message}`);
      return retry.data;
    }

    if (error) throw new Error(`Failed to update calendar: ${error.message}`);
    return data;
  }

  async softDelete(id: string): Promise<void> {
    // Try soft delete with deleted_at; fall back to status-only update
    const { error } = await this.db
      .from('calendars')
      .update({
        deleted_at: new Date().toISOString(),
        status: 'archived',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error && isMissingColumn(error)) {
      const retry = await this.db
        .from('calendars')
        .update({ status: 'archived' })
        .eq('id', id);

      if (retry.error) throw new Error(`Failed to delete calendar: ${retry.error.message}`);
      return;
    }

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
    // Try with workspace_id; fall back without if column not yet added
    const { data, error } = await this.db
      .from('agent_calendars')
      .insert({
        workspace_id: input.workspace_id,
        agent_id: input.agent_id,
        calendar_id: input.calendar_id,
      })
      .select()
      .single();

    if (error && isMissingColumn(error)) {
      const retry = await this.db
        .from('agent_calendars')
        .insert({
          agent_id: input.agent_id,
          calendar_id: input.calendar_id,
        })
        .select()
        .single();

      if (retry.error) {
        if (retry.error.code === '23505') {
          throw new Error('Calendar is already assigned to this agent');
        }
        throw new Error(`Failed to assign calendar: ${retry.error.message}`);
      }
      return retry.data;
    }

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

  async listForCampaign(campaignId: string): Promise<Calendar[]> {
    const { data, error } = await this.db
      .from('campaign_calendars')
      .select('calendar_id, calendars(*)')
      .eq('campaign_id', campaignId);

    if (error) throw new Error(`Failed to list campaign calendars: ${error.message}`);
    return (data ?? []).map((row: Record<string, unknown>) => row.calendars as unknown as Calendar);
  }

  async assignToCampaign(input: {
    workspace_id: string;
    campaign_id: string;
    calendar_id: string;
  }): Promise<CampaignCalendar> {
    const { data, error } = await this.db
      .from('campaign_calendars')
      .insert({
        workspace_id: input.workspace_id,
        campaign_id: input.campaign_id,
        calendar_id: input.calendar_id,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('Calendar is already assigned to this campaign');
      }
      throw new Error(`Failed to assign calendar to campaign: ${error.message}`);
    }
    return data;
  }

  async removeFromCampaign(campaignId: string, calendarId: string): Promise<void> {
    const { error } = await this.db
      .from('campaign_calendars')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('calendar_id', calendarId);

    if (error) throw new Error(`Failed to remove campaign calendar: ${error.message}`);
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
