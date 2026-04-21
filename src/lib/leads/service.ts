import type { SupabaseClient } from '@supabase/supabase-js';
import type { Lead } from '@lib/types';
import { EntityStatus } from '@lib/types';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { PhoneNumberService } from '@lib/messaging/phone-numbers';

export interface UpsertLeadInput {
  workspace_id: string;
  phone: string;
  first_name: string;
  last_name?: string;
  email?: string;
  timezone?: string;
  external_contact_id?: string;
  crm_provider?: string;
  source_json?: Record<string, unknown>;
  /** ISO-2 country code to use when `phone` is not already in E.164. Overrides workspace default. */
  default_country?: string;
}

export class LeadService {
  constructor(private readonly db: SupabaseClient) {}

  /** Upsert lead by phone within workspace. Normalize phone to E.164. */
  async upsertByPhone(input: UpsertLeadInput): Promise<Lead> {
    const defaultCountry = input.default_country
      ?? (await this.resolveWorkspaceDefaultCountry(input.workspace_id));
    const phoneE164 = this.normalizePhone(input.phone, defaultCountry);

    // Check existing
    const { data: existing } = await this.db
      .from('leads')
      .select('*')
      .eq('workspace_id', input.workspace_id)
      .eq('phone_e164', phoneE164)
      .limit(1)
      .single();

    if (existing) {
      // Update fields if newer data provided
      const { data: updated, error } = await this.db
        .from('leads')
        .update({
          first_name: input.first_name || existing.first_name,
          last_name: input.last_name || existing.last_name,
          email: input.email || existing.email,
          timezone: input.timezone || existing.timezone,
          external_contact_id: input.external_contact_id || existing.external_contact_id,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw new Error(`Failed to update lead: ${error.message}`);
      return updated;
    }

    // Create new
    const { data, error } = await this.db
      .from('leads')
      .insert({
        workspace_id: input.workspace_id,
        phone_e164: phoneE164,
        first_name: input.first_name,
        last_name: input.last_name ?? '',
        email: input.email ?? null,
        timezone: input.timezone ?? null,
        external_contact_id: input.external_contact_id ?? null,
        crm_provider: input.crm_provider ?? null,
        status: EntityStatus.Active,
        source_json: input.source_json ?? {},
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create lead: ${error.message}`);
    return data;
  }

  async getById(id: string): Promise<Lead | null> {
    const { data, error } = await this.db
      .from('leads')
      .select('*')
      .eq('id', id)
      .single();

    if (error) return null;
    return data;
  }

  async findByPhone(workspaceId: string, phone: string): Promise<Lead | null> {
    const defaultCountry = await this.resolveWorkspaceDefaultCountry(workspaceId);
    const phoneE164 = this.normalizePhone(phone, defaultCountry);
    const { data, error } = await this.db
      .from('leads')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('phone_e164', phoneE164)
      .limit(1)
      .single();

    if (error) return null;
    return data;
  }

  private normalizePhone(phone: string, defaultCountry: string | null): string {
    const country = (defaultCountry ?? 'US').toUpperCase() as never;
    const parsed = parsePhoneNumberFromString(phone, country);
    if (!parsed || !parsed.isValid()) {
      throw new Error(`Invalid phone number: ${phone}`);
    }
    return parsed.format('E.164');
  }

  /** Look up the workspace's default outbound number country, if any. */
  private async resolveWorkspaceDefaultCountry(workspaceId: string): Promise<string | null> {
    try {
      const phoneNumbers = new PhoneNumberService(this.db);
      return await phoneNumbers.defaultCountry(workspaceId);
    } catch {
      return null;
    }
  }
}
