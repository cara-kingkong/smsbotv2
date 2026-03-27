import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { ConversationStatus } from '../../src/lib/types';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

/**
 * List inbox conversations for a workspace.
 * GET /.netlify/functions/api-inbox-list?workspace_id=...&status=...&limit=...&offset=...
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

    const statusFilter = url.searchParams.get('status');
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

    // Validate status filter if provided
    const allowedStatuses = [
      ConversationStatus.NeedsHuman,
      ConversationStatus.HumanControlled,
      ConversationStatus.Active,
    ];

    if (statusFilter && !allowedStatuses.includes(statusFilter as ConversationStatus)) {
      return new Response(
        JSON.stringify({ error: `Invalid status filter. Allowed: ${allowedStatuses.join(', ')}` }),
        { status: 400 },
      );
    }

    // Build query: conversations with last message and lead info
    let query = db
      .from('conversations')
      .select(`
        *,
        lead:leads(id, first_name, last_name, phone_e164, email),
        last_message:messages(id, body_text, sender_type, direction, created_at)
      `)
      .eq('workspace_id', access.workspace.id)
      .is('deleted_at', null)
      .order('last_activity_at', { ascending: false })
      .limit(1, { foreignTable: 'messages' })
      .order('created_at', { ascending: false, foreignTable: 'messages' });

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    } else {
      // Default: show conversations that need attention
      query = query.in('status', [
        ConversationStatus.NeedsHuman,
        ConversationStatus.HumanControlled,
        ConversationStatus.Active,
        ConversationStatus.WaitingForLead,
      ]);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) throw new Error(`Failed to list inbox conversations: ${error.message}`);

    return new Response(JSON.stringify(data ?? []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-inbox-list error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
