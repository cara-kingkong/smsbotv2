import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { PhoneNumberService } from '../../src/lib/messaging/phone-numbers';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';
import { requireRole } from '../../src/lib/auth/permissions';
import { WorkspaceRole } from '../../src/lib/types';

const SUPPORTED_COUNTRIES = ['AU', 'US'];

/**
 * Create a phone number entry for a workspace.
 * POST /.netlify/functions/api-workspace-phone-numbers-create
 * Body: { workspace_id, e164, country_code, label?, is_default?, provider? }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { workspace_id, e164, country_code, label, is_default, provider } = body;

    if (!workspace_id || !e164 || !country_code) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: workspace_id, e164, country_code' }),
        { status: 400 },
      );
    }

    const countryUpper = String(country_code).toUpperCase();
    if (!SUPPORTED_COUNTRIES.includes(countryUpper)) {
      return new Response(
        JSON.stringify({ error: `Unsupported country_code. Must be one of: ${SUPPORTED_COUNTRIES.join(', ')}` }),
        { status: 400 },
      );
    }

    const access = await requireWorkspaceAccess(req, workspace_id);
    if (access instanceof Response) return access;
    const guard = requireRole(access, WorkspaceRole.Admin);
    if (guard instanceof Response) return guard;

    const service = new PhoneNumberService(getServiceClient());
    const created = await service.create({
      workspace_id: access.workspace.id,
      e164,
      country_code: countryUpper,
      label,
      is_default,
      provider,
    });

    return new Response(JSON.stringify(created), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-workspace-phone-numbers-create error:', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    if (message.startsWith('Invalid phone number')) {
      return new Response(JSON.stringify({ error: message }), { status: 400 });
    }
    if (message.includes('duplicate key')) {
      return new Response(JSON.stringify({ error: 'This phone number is already registered.' }), { status: 409 });
    }
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
