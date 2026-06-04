import type { Config, Context } from '@netlify/functions';
import { getServiceClient } from '../../src/lib/db/client';
import { ConversationService } from '../../src/lib/conversations/service';
import { evaluateStopConditions } from '../../src/lib/utils/stop-conditions';
import {
  ConversationStatus,
  ConversationOutcome,
  ConversationEventType,
} from '../../src/lib/types';
import type { Conversation, StopConditions } from '../../src/lib/types';

export const config: Config = {
  schedule: '*/15 * * * *',
};

/**
 * Safety-net scheduled function: auto-completes conversations that have gone
 * stale (exceeded max_no_reply_hours / max_days) but never had their stop
 * conditions re-evaluated.
 *
 * WHY THIS EXISTS: evaluateStopConditions only runs at the top of an AI-reply
 * job. For a silent lead, the only thing that re-runs that job is a scheduled
 * follow-up — and follow-ups stop being enqueued once max_followups is reached
 * (typically within a few hours). The time-based stop conditions (72h, 14 days)
 * are therefore never reached during an evaluation, leaving conversations
 * frozen in `waiting_for_lead` forever. This sweep decouples stop-condition
 * evaluation from follow-up scheduling so those conversations finally complete.
 *
 * Only "automated waiting" statuses are swept. We deliberately exclude:
 *   - paused_manual / human_controlled / needs_human: a human owns these
 *   - terminal statuses (completed / opted_out / failed)
 */
const SWEEPABLE_STATUSES = [
  ConversationStatus.WaitingForLead,
  ConversationStatus.PausedBusinessHours,
];

// Cap work per invocation so the first run over a large backlog can't time out.
// Stalest conversations are processed first; the rest drain over subsequent runs.
const BATCH_LIMIT = 300;

const DEFAULT_STOP_CONDITIONS: StopConditions = {
  max_messages: 50,
  max_days: 14,
  max_no_reply_hours: 72,
};

/** Mirror the effective-stop-conditions resolution used in process-ai-reply-background:
 *  campaign overrides workspace, workspace overrides hardcoded defaults. */
function resolveStopConditions(
  campaign: { stop_conditions_json?: Partial<StopConditions> } | undefined,
  workspace: { stop_conditions_json?: Partial<StopConditions> } | undefined,
): StopConditions {
  const campaignSc = campaign?.stop_conditions_json;
  const hasCampaign = campaignSc?.max_messages !== undefined
    && Object.keys(campaignSc).length > 0;
  if (hasCampaign) return campaignSc as StopConditions;

  const workspaceSc = workspace?.stop_conditions_json;
  if (workspaceSc && 'max_messages' in workspaceSc) return workspaceSc as StopConditions;

  return DEFAULT_STOP_CONDITIONS;
}

export default async (_req: Request, _context: Context) => {
  const db = getServiceClient();
  const conversationService = new ConversationService(db);

  try {
    const { data: conversations, error: convError } = await db
      .from('conversations')
      .select('*')
      .in('status', SWEEPABLE_STATUSES)
      .eq('human_controlled', false)
      .is('deleted_at', null)
      .order('last_activity_at', { ascending: true })
      .limit(BATCH_LIMIT);

    if (convError) {
      console.error('process-conversation-sweep: failed to query conversations', convError);
      return new Response('Error', { status: 500 });
    }

    if (!conversations || conversations.length === 0) {
      return new Response('No conversations to sweep', { status: 200 });
    }

    // Batch-fetch stop-condition config for every distinct campaign and workspace
    // referenced, so per-conversation evaluation stays O(1) on lookups.
    const campaignIds = [...new Set(conversations.map((c) => c.campaign_id))];
    const workspaceIds = [...new Set(conversations.map((c) => c.workspace_id))];

    const [{ data: campaigns }, { data: workspaces }] = await Promise.all([
      db.from('campaigns').select('id, stop_conditions_json').in('id', campaignIds),
      db.from('workspaces').select('id, stop_conditions_json').in('id', workspaceIds),
    ]);

    const campaignById = new Map((campaigns ?? []).map((c) => [c.id, c]));
    const workspaceById = new Map((workspaces ?? []).map((w) => [w.id, w]));

    let completed = 0;

    for (const conversation of conversations as Conversation[]) {
      const stopConditions = resolveStopConditions(
        campaignById.get(conversation.campaign_id),
        workspaceById.get(conversation.workspace_id),
      );

      const stopResult = await evaluateStopConditions(db, conversation, stopConditions);
      if (!stopResult.should_stop) continue;

      // Preserve a qualification-aware outcome if a prior AI run assessed the
      // lead; only default to NoResponse when no outcome has been set. This
      // mirrors the inline completion path in process-ai-reply-background.
      if (!conversation.outcome) {
        const { data: lastDecision } = await db
          .from('ai_decisions')
          .select('decision_json')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const qualState = (lastDecision?.decision_json as Record<string, unknown>)?.qualification_state;
        const outcome = qualState === 'qualified'
          ? ConversationOutcome.QualifiedNotBooked
          : qualState === 'unqualified'
            ? ConversationOutcome.Unqualified
            : ConversationOutcome.NoResponse;

        await conversationService.setOutcome(conversation.id, outcome);
      }

      await conversationService.updateStatus(conversation.id, ConversationStatus.Completed);
      await db.from('conversation_events').insert({
        conversation_id: conversation.id,
        event_type: ConversationEventType.StopConditionReached,
        event_payload_json: {
          reason: stopResult.reason,
          source: 'conversation_sweep',
          preserved_outcome: conversation.outcome ?? null,
        },
      });

      completed++;
    }

    console.log(
      `process-conversation-sweep: completed ${completed} of ${conversations.length} swept`,
    );
    return new Response(JSON.stringify({ swept: conversations.length, completed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('process-conversation-sweep error:', err);
    return new Response('Error', { status: 500 });
  }
};
