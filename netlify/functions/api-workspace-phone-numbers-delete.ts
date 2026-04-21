import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { PhoneNumberService } from '../../src/lib/messaging/phone-numbers';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';
import { requireRole } from '../../src/lib/auth/permissions';
import { WorkspaceRole } from '../../src/lib/types';

/**
 * Delete a workspace phone number.
 * DELETE /.netlify/functions/api-workspace-phone-numbers-delete?id=...&workspace_id=...
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'DELETE') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const workspaceId = url.searchParams.get('workspace_id');

    if (!id || !workspaceId) {
      return new Response(JSON.stringify({ error: 'Missing required params: id, workspace_id' }), { status: 400 });
    }

    const access = await requireWorkspaceAccess(req, workspaceId);
    if (access instanceof Response) return access;
    const guard = requireRole(access, WorkspaceRole.Admin);
    if (guard instanceof Response) return guard;

    const service = new PhoneNumberService(getServiceClient());
    await service.delete(id, access.workspace.id);

    return new Response(null, { status: 204 });
  } catch (err) {
    console.error('api-workspace-phone-numbers-delete error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
