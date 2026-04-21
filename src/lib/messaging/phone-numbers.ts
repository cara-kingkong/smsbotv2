import type { SupabaseClient } from '@supabase/supabase-js';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import type { WorkspacePhoneNumber } from '@lib/types';

export interface CreatePhoneNumberInput {
  workspace_id: string;
  e164: string;
  country_code: string;
  label?: string;
  is_default?: boolean;
  provider?: string;
}

export interface UpdatePhoneNumberInput {
  label?: string;
  is_default?: boolean;
  country_code?: string;
}

/**
 * Manages the per-workspace phone number inventory and outbound number
 * selection. Country is resolved from the lead's E.164 number; falls back
 * to the workspace's `is_default` entry.
 */
export class PhoneNumberService {
  constructor(private readonly db: SupabaseClient) {}

  async list(workspaceId: string): Promise<WorkspacePhoneNumber[]> {
    const { data, error } = await this.db
      .from('workspace_phone_numbers')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('is_default', { ascending: false })
      .order('country_code', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Failed to list phone numbers: ${error.message}`);
    return data ?? [];
  }

  async getById(id: string): Promise<WorkspacePhoneNumber | null> {
    const { data, error } = await this.db
      .from('workspace_phone_numbers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) return null;
    return data;
  }

  async create(input: CreatePhoneNumberInput): Promise<WorkspacePhoneNumber> {
    const e164 = normaliseE164(input.e164, input.country_code);
    const countryCode = input.country_code.toUpperCase();

    if (input.is_default) {
      await this.clearDefault(input.workspace_id);
    }

    const { data, error } = await this.db
      .from('workspace_phone_numbers')
      .insert({
        workspace_id: input.workspace_id,
        e164,
        country_code: countryCode,
        label: input.label ?? '',
        is_default: input.is_default ?? false,
        provider: input.provider ?? 'twilio',
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create phone number: ${error.message}`);
    return data;
  }

  async update(id: string, workspaceId: string, patch: UpdatePhoneNumberInput): Promise<WorkspacePhoneNumber> {
    const updates: Record<string, unknown> = {};
    if (patch.label !== undefined) updates.label = patch.label;
    if (patch.country_code !== undefined) updates.country_code = patch.country_code.toUpperCase();

    if (patch.is_default === true) {
      await this.clearDefault(workspaceId, id);
      updates.is_default = true;
    } else if (patch.is_default === false) {
      updates.is_default = false;
    }

    if (Object.keys(updates).length === 0) {
      const existing = await this.getById(id);
      if (!existing) throw new Error('Phone number not found');
      return existing;
    }

    const { data, error } = await this.db
      .from('workspace_phone_numbers')
      .update(updates)
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update phone number: ${error.message}`);
    return data;
  }

  async delete(id: string, workspaceId: string): Promise<void> {
    const { error } = await this.db
      .from('workspace_phone_numbers')
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId);

    if (error) throw new Error(`Failed to delete phone number: ${error.message}`);
  }

  /**
   * Pick the outbound number for a given lead. MUST match the lead's
   * country — we never send into a country the workspace hasn't configured.
   * When multiple numbers in that country exist, the workspace default is
   * preferred. Returns null when the lead's country can't be determined
   * or the workspace has no number in that country.
   */
  async resolveForLead(workspaceId: string, leadE164: string): Promise<WorkspacePhoneNumber | null> {
    const country = parsePhoneNumberFromString(leadE164)?.country;
    if (!country) return null;

    const numbers = await this.list(workspaceId);
    const countryMatches = numbers.filter((n) => n.country_code === country);
    if (countryMatches.length === 0) return null;

    return countryMatches.find((n) => n.is_default) ?? countryMatches[0];
  }

  /**
   * Find the workspace that owns an E.164 number. Used by inbound webhooks
   * to pin the workspace before looking up the lead.
   */
  async findByE164(e164: string): Promise<WorkspacePhoneNumber | null> {
    const { data, error } = await this.db
      .from('workspace_phone_numbers')
      .select('*')
      .eq('e164', e164)
      .maybeSingle();

    if (error) return null;
    return data;
  }

  /** Default country for workspace-level phone parsing — returns ISO-2. */
  async defaultCountry(workspaceId: string): Promise<string | null> {
    const numbers = await this.list(workspaceId);
    if (numbers.length === 0) return null;
    return (numbers.find((n) => n.is_default) ?? numbers[0]).country_code;
  }

  private async clearDefault(workspaceId: string, exceptId?: string): Promise<void> {
    let query = this.db
      .from('workspace_phone_numbers')
      .update({ is_default: false })
      .eq('workspace_id', workspaceId)
      .eq('is_default', true);

    if (exceptId) query = query.neq('id', exceptId);

    const { error } = await query;
    if (error) throw new Error(`Failed to clear default: ${error.message}`);
  }
}

function normaliseE164(raw: string, defaultCountry: string): string {
  const parsed = parsePhoneNumberFromString(raw, defaultCountry.toUpperCase() as never);
  if (!parsed || !parsed.isValid()) {
    throw new Error(`Invalid phone number: ${raw}`);
  }
  return parsed.format('E.164');
}
