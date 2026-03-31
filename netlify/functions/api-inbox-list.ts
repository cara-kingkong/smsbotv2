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
        *,
        lead:leads(id, first_name, last_name, phone_e164, email)
      `)
      .eq('workspace_id', access.workspace.id)
      .is('deleted_at', null)
      .order('last_activity_at', { ascending: false })
      .range(offset, offset + limit - 1);

    query = statusFilter
      ? query.eq('status', statusFilter)
      : query.in('status', allowedStatuses);

    const { data: conversations, error } = await query;
    if (error) throw new Error(`Failed to list inbox conversations: ${error.message}`);

    const conversationIds = (conversations ?? []).map((conversation) => conversation.id);
    const lastMessageByConversation = new Map<string, unknown>();

    if (conversationIds.length > 0) {
      const { data: messages, error: messageError } = await db
        .from('messages')
        .select('id, conversation_id, body_text, sender_type, direction, created_at')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false });

      if (messageError) throw new Error(`Failed to load inbox messages: ${messageError.message}`);

      for (const message of messages ?? []) {
        if (!lastMessageByConversation.has(message.conversation_id)) {
          lastMessageByConversation.set(message.conversation_id, [message]);
        }
      }
    }

    const payload = (conversations ?? []).map((conversation) => ({
      ...conversation,
      last_message: (lastMessageByConversation.get(conversation.id) as unknown[] | undefined) ?? [],
    }));

    return new Response(JSON.stringify(payload), {
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
