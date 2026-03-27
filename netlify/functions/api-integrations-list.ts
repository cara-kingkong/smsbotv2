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

    return new Response(JSON.stringify(integrations), {
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
