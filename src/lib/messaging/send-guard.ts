import type { SupabaseClient } from '@supabase/supabase-js';
import type { QueueService } from '@lib/queues/service';
import type { BusinessHours, SenderType } from '@lib/types';
import { ConversationStatus, SenderType as SenderTypeEnum } from '@lib/types';
import {
  isWithinBusinessHours,
  getNextBusinessHoursStart,
} from '@lib/utils/business-hours';

export type SendGuardResult =
  | { allow: true }
  | { allow: false; reason: 'outside_business_hours'; reschedule_at: string | null };

export interface SendGuardInput {
  db: SupabaseClient;
  queueService: QueueService;
  conversationId: string;
  senderType: SenderType;
  /** Job payload to re-enqueue when the guard defers the send. */
  reschedule?: {
    jobType: string;
    queueName: string;
    payload: Record<string, unknown>;
    workspaceId: string;
  };
}

/**
 * Decide whether an outbound SMS may go out right now based on the
 * effective (campaign > workspace) business hours. Human-initiated sends
 * bypass the check — operators in the inbox are trusted. When deferred,
 * the conversation is moved to `paused_business_hours` and the originating
 * job is re-enqueued for the next open window.
 */
export async function checkSendAllowed(input: SendGuardInput): Promise<SendGuardResult> {
  if (input.senderType === SenderTypeEnum.Human || input.senderType === SenderTypeEnum.Lead) {
    return { allow: true };
  }

  const { db } = input;

  const { data: conversation } = await db
    .from('conversations')
    .select('id, workspace_id, campaign_id, lead_id, status, human_controlled')
    .eq('id', input.conversationId)
    .is('deleted_at', null)
    .single();

  if (!conversation) return { allow: true };
  if (conversation.human_controlled) return { allow: true };

  const [campaignRes, workspaceRes, leadRes] = await Promise.all([
    db.from('campaigns').select('business_hours_json').eq('id', conversation.campaign_id).single(),
    db.from('workspaces').select('business_hours_json').eq('id', conversation.workspace_id).single(),
    db.from('leads').select('timezone').eq('id', conversation.lead_id).single(),
  ]);

  const effective = resolveEffectiveHours(
    campaignRes.data?.business_hours_json,
    workspaceRes.data?.business_hours_json,
  );

  if (!effective || !effective.schedule?.length) return { allow: true };

  const leadTimezone = leadRes.data?.timezone ?? null;
  if (isWithinBusinessHours(effective, leadTimezone)) return { allow: true };

  const nextOpen = getNextBusinessHoursStart(effective, leadTimezone);
  const rescheduleAt = nextOpen?.toISOString() ?? null;

  if (input.reschedule && rescheduleAt) {
    await input.queueService.enqueue({
      workspace_id: input.reschedule.workspaceId,
      job_type: input.reschedule.jobType,
      queue_name: input.reschedule.queueName,
      payload: input.reschedule.payload,
      run_at: nextOpen!,
    });
    await db
      .from('conversations')
      .update({ status: ConversationStatus.PausedBusinessHours })
      .eq('id', input.conversationId);
  }

  return { allow: false, reason: 'outside_business_hours', reschedule_at: rescheduleAt };
}

function resolveEffectiveHours(
  campaignHours: unknown,
  workspaceHours: unknown,
): BusinessHours | null {
  const campaign = campaignHours as BusinessHours | null | undefined;
  if (campaign && Array.isArray(campaign.schedule) && campaign.schedule.length > 0) {
    return campaign;
  }
  const workspace = workspaceHours as BusinessHours | null | undefined;
  if (workspace && Array.isArray(workspace.schedule) && workspace.schedule.length > 0) {
    return workspace;
  }
  return null;
}
