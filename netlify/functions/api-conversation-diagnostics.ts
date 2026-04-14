import type { Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { ConversationService } from '../../src/lib/conversations/service';
import { requireWorkspaceAccess } from '../../src/lib/auth/request';

/**
 * Fetch a user-facing diagnostics bundle for a single conversation.
 * GET /.netlify/functions/api-conversation-diagnostics?conversation_id=...
 */
export default async (req: Request, _context: Context) => {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const db = getServiceClient();

  try {
    const url = new URL(req.url);
    const conversationId = url.searchParams.get('conversation_id');

    if (!conversationId) {
      return new Response(JSON.stringify({ error: 'conversation_id is required' }), { status: 400 });
    }

    const conversationService = new ConversationService(db);
    const conversation = await conversationService.getById(conversationId);
    if (!conversation) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), { status: 404 });
    }

    const access = await requireWorkspaceAccess(req, conversation.workspace_id);
    if (access instanceof Response) return access;

    const [eventsResult, jobsResult, aiResult, crmResult] = await Promise.all([
      db
        .from('conversation_events')
        .select('id, event_type, event_payload_json, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(25),
      db
        .from('jobs')
        .select('id, job_type, queue_name, status, attempts, max_attempts, run_at, last_error, created_at, completed_at, payload_json')
        .eq('workspace_id', conversation.workspace_id)
        .contains('payload_json', { conversation_id: conversationId })
        .order('created_at', { ascending: false })
        .limit(12),
      db
        .from('ai_decisions')
        .select('id, decision_json, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from('crm_events')
        .select('id, event_type, status, request_payload_json, response_payload_json, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    if (eventsResult.error) throw new Error(`Failed to load conversation events: ${eventsResult.error.message}`);
    if (jobsResult.error) throw new Error(`Failed to load related jobs: ${jobsResult.error.message}`);
    if (aiResult.error) throw new Error(`Failed to load latest AI decision: ${aiResult.error.message}`);
    if (crmResult.error) throw new Error(`Failed to load CRM events: ${crmResult.error.message}`);

    const latestDecision = aiResult.data
      ? {
          id: aiResult.data.id,
          created_at: aiResult.data.created_at,
          ...(aiResult.data.decision_json ?? {}),
        }
      : null;

    return new Response(JSON.stringify({
      conversation: {
        id: conversation.id,
        status: conversation.status,
        outcome: conversation.outcome,
        needs_human: conversation.needs_human,
        human_controlled: conversation.human_controlled,
        opened_at: conversation.opened_at,
        last_activity_at: conversation.last_activity_at,
        closed_at: conversation.closed_at,
      },
      latest_ai_decision: latestDecision,
      conversation_events: eventsResult.data ?? [],
      related_jobs: jobsResult.data ?? [],
      crm_events: crmResult.data ?? [],
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=5, stale-while-revalidate=15',
      },
    });
  } catch (err) {
    console.error('api-conversation-diagnostics error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 },
    );
  }
};
