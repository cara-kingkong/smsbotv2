import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { PhoneNumberService } from '../../src/lib/messaging/phone-numbers';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';
import { requireRole } from '../../src/lib/auth/permissions';
import { WorkspaceRole } from '../../src/lib/types';

const SUPPORTED_COUNTRIES = ['AU', 'US'];

/**
 * Update a workspace phone number entry.
 * PUT /.netlify/functions/api-workspace-phone-numbers-update
 * Body: { id, workspace_id, label?, is_default?, country_code? }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'PUT') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { id, workspace_id, label, is_default, country_code } = body;

    if (!id || !workspace_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields: id, workspace_id' }), { status: 400 });
    }

    if (country_code !== undefined) {
      const countryUpper = String(country_code).toUpperCase();
      if (!SUPPORTED_COUNTRIES.includes(countryUpper)) {
        return new Response(
          JSON.stringify({ error: `Unsupported country_code. Must be one of: ${SUPPORTED_COUNTRIES.join(', ')}` }),
          { status: 400 },
        );
      }
    }

    const access = await requireWorkspaceAccess(req, workspace_id);
    if (access instanceof Response) return access;
    const guard = requireRole(access, WorkspaceRole.Admin);
    if (guard instanceof Response) return guard;

    const service = new PhoneNumberService(getServiceClient());
    const updated = await service.update(id, access.workspace.id, {
      label,
      is_default,
      country_code,
    });

    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-workspace-phone-numbers-update error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
