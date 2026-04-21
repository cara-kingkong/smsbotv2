import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';
import { requireRole } from '../../src/lib/auth/permissions';
import { WorkspaceRole } from '../../src/lib/types';
import { QueueService } from '../../src/lib/queues/service';

/**
 * Soft-delete a conversation.
 * POST /.netlify/functions/api-inbox-delete
 * Body: { conversation_id }
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const { conversation_id } = await req.json() as { conversation_id: string };

    if (!conversation_id) {
      return new Response(JSON.stringify({ error: 'Missing conversation_id' }), { status: 400 });
    }

    // Look up conversation to get workspace_id for access check
    const { data: conv, error: convError } = await db
      .from('conversations')
      .select('id, workspace_id')
      .eq('id', conversation_id)
      .is('deleted_at', null)
      .single();

    if (convError || !conv) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), { status: 404 });
    }

    const access = await requireWorkspaceAccess(req, conv.workspace_id);
    if (access instanceof Response) return access;
    const guard = requireRole(access, WorkspaceRole.Manager);
    if (guard instanceof Response) return guard;

    const { error } = await db
      .from('conversations')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', conversation_id);

    if (error) throw new Error(`Failed to delete conversation: ${error.message}`);

    // Cancel any pending jobs for this conversation
    const queueService = new QueueService(db);
    await queueService.cancelByConversation(conversation_id);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-inbox-delete error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
