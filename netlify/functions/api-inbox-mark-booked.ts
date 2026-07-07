import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { ConversationService } from '../../src/lib/conversations/service';
import { ConversationStatus, ConversationOutcome, WorkspaceRole } from '../../src/lib/types';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';
import { requireRole } from '../../src/lib/auth/permissions';

/**
 * Manually mark a conversation's outcome as `booked` — reporting only.
 * POST /.netlify/functions/api-inbox-mark-booked
 * Body: { conversation_id: string }
 *
 * For when a human has taken the thread over and booked the lead out-of-band
 * (e.g. on a call). This records the outcome ONLY: it runs no booking
 * automation — no Calendly hold, no CRM sync, no confirmation SMS — and leaves
 * the conversation status untouched so the operator keeps the open thread.
 * Reversible.
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const { conversation_id } = (await req.json()) as { conversation_id: string };

    if (!conversation_id) {
      return new Response(JSON.stringify({ error: 'conversation_id is required' }), { status: 400 });
    }

    const conversationService = new ConversationService(db);
    const conversation = await conversationService.getById(conversation_id);

    if (!conversation) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), { status: 404 });
    }

    const access = await requireWorkspaceAccess(req, conversation.workspace_id);
    if (access instanceof Response) return access;
    const guard = requireRole(access, WorkspaceRole.Manager);
    if (guard instanceof Response) return guard;

    // Don't relabel a closed thread — a completed/opted-out/failed conversation
    // keeps its recorded outcome (opted-out especially must never read booked).
    const terminalStatuses = [
      ConversationStatus.Completed,
      ConversationStatus.OptedOut,
      ConversationStatus.Failed,
    ];
    if (terminalStatuses.includes(conversation.status as ConversationStatus)) {
      return new Response(
        JSON.stringify({ error: `Cannot mark a ${conversation.status} conversation as booked` }),
        { status: 409 },
      );
    }

    // Already booked is a no-op success.
    if (conversation.outcome === ConversationOutcome.Booked) {
      return new Response(JSON.stringify(conversation), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const updated = await conversationService.markBookedManually(conversation_id);

    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('api-inbox-mark-booked error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
