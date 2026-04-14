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
    const parsedLimit = Number.parseInt(url.searchParams.get('limit') ?? '50', 10);
    const parsedOffset = Number.parseInt(url.searchParams.get('offset') ?? '0', 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 50;
    const offset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;

    const allowedStatuses = [
      ConversationStatus.Queued,
      ConversationStatus.NeedsHuman,
      ConversationStatus.HumanControlled,
      ConversationStatus.Active,
      ConversationStatus.WaitingForLead,
      ConversationStatus.PausedBusinessHours,
      ConversationStatus.PausedManual,
      ConversationStatus.Completed,
      ConversationStatus.OptedOut,
      ConversationStatus.Failed,
    ];

    if (statusFilter && !allowedStatuses.includes(statusFilter as ConversationStatus)) {
      return new Response(
        JSON.stringify({ error: `Invalid status filter. Allowed: ${allowedStatuses.join(', ')}` }),
        { status: 400 },
      );
    }

    let query = db
      .from('conversations')
      .select(`
        id, status, human_controlled, needs_human, last_activity_at, outcome,
        lead:leads(id, first_name, last_name, phone_e164, email)
      `)
      .eq('workspace_id', access.workspace.id)
      .is('deleted_at', null)
      .order('last_activity_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (statusFilter) {
      query = query.eq('status', statusFilter);
    }

    const { data: conversations, error } = await query;
    if (error) throw new Error(`Failed to list inbox conversations: ${error.message}`);

    const conversationIds = (conversations ?? []).map((conversation) => conversation.id);
    const lastMessageByConversation = new Map<string, unknown>();

    if (conversationIds.length > 0) {
      // Fetch only the most recent message per conversation using limit per group.
      // Supabase doesn't support DISTINCT ON, so we fetch 1 message per conversation
      // in parallel batches to avoid pulling all messages into memory.
      const messagePromises = conversationIds.map((convId) =>
        db
          .from('messages')
          .select('id, conversation_id, body_text, sender_type, direction, created_at')
          .eq('conversation_id', convId)
          .order('created_at', { ascending: false })
          .limit(1)
      );

      const messageResults = await Promise.all(messagePromises);

      for (const result of messageResults) {
        if (result.error) continue;
        const msg = result.data?.[0];
        if (msg) {
          lastMessageByConversation.set(msg.conversation_id, [msg]);
        }
      }
    }

    const payload = (conversations ?? []).map((conversation) => ({
      ...conversation,
      last_message: (lastMessageByConversation.get(conversation.id) as unknown[] | undefined) ?? [],
    }));

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=5, stale-while-revalidate=15',
      },
    });
  } catch (err) {
    console.error('api-inbox-list error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
