import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { PhoneNumberService } from '../../src/lib/messaging/phone-numbers';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

/**
 * List phone numbers for a workspace.
 * GET /.netlify/functions/api-workspace-phone-numbers-list?workspace_id=...
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get('workspace_id');
    const access = await requireWorkspaceAccess(req, workspaceId);
    if (access instanceof Response) return access;

    const service = new PhoneNumberService(getServiceClient());
    const numbers = await service.list(access.workspace.id);

    return new Response(JSON.stringify(numbers), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-workspace-phone-numbers-list error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
