import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { IntegrationService } from '../../src/lib/integrations/service';
import type { IntegrationType } from '../../src/lib/types/enums';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

const VALID_TYPES = ['crm', 'calendar', 'sms', 'ai_provider'];

/**
 * List integrations for a workspace.
 * GET /.netlify/functions/api-integrations-list?workspace_id=...&type=...
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get('workspace_id');
    const access = await requireWorkspaceAccess(req, workspaceId);
    if (access instanceof Response) return access;

    const typeParam = url.searchParams.get('type');
    if (typeParam && !VALID_TYPES.includes(typeParam)) {
      return new Response(
        JSON.stringify({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` }),
        { status: 400 },
      );
    }

    const service = new IntegrationService(db);
    const integrations = await service.listByWorkspace(
      access.workspace.id,
      typeParam as IntegrationType | undefined,
    );

    // Redact secrets before sending to the client. Replace each with a
    // `has_<field>` boolean so the UI can show "saved" state without ever
    // round-tripping the credential to the browser.
    const SECRET_FIELDS = ['api_key', 'auth_token', 'account_sid'];
    const sanitized = integrations.map((integration) => {
      const config = { ...(integration.config_json ?? {}) } as Record<string, unknown>;
      for (const field of SECRET_FIELDS) {
        if (typeof config[field] === 'string' && (config[field] as string).length > 0) {
          config[`has_${field}`] = true;
        }
        delete config[field];
      }
      return { ...integration, config_json: config };
    });

    return new Response(JSON.stringify(sanitized), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-integrations-list error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
