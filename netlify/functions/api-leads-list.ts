import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

/**
 * List leads for a workspace.
 * GET /.netlify/functions/api-leads-list?workspace_id=...&limit=...&offset=...&search=...
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

    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
    const search = url.searchParams.get('search')?.trim();

    let query = db
      .from('leads')
      .select('*')
      .eq('workspace_id', access.workspace.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (search) {
      // Search by name, phone, or email
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone_e164.ilike.%${search}%,email.ilike.%${search}%`);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) throw new Error(`Failed to list leads: ${error.message}`);

    return new Response(JSON.stringify(data ?? []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-leads-list error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
