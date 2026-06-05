/**
 * Outbound escalation notifications.
 *
 * When the AI escalates a conversation to a human we DON'T text the lead — the
 * bot is presented as a real person ("Mark"), and a robotic "I'm handing this
 * off" line breaks that illusion (and is often sent to a lead who never even
 * replied). Instead we POST the escalation to a team-facing webhook so a human
 * can pick it up. The conversation also surfaces in the Needs Human inbox tab
 * regardless of webhook delivery.
 *
 * The body is a simple `{ text }` message — the format Google Chat and Slack
 * incoming webhooks both accept — so the same webhook used for error reporting
 * works without changes. URL resolution falls back to GOOGLE_CHAT_WEBHOOK_URL
 * so no new env var is required to get started. Per-workspace webhook config is
 * a planned follow-up — `workspaceId` is threaded through so that's additive.
 */

export interface EscalationNotification {
  /** Why the conversation needs a human (e.g. 'ai_escalation', 'no_assigned_calendar'). */
  reason: string;
  workspace_id: string;
  conversation_id: string;
  lead: {
    first_name: string | null;
    last_name: string | null;
    phone: string;
  };
  qualification_state?: string | null;
  should_book?: boolean;
  /** Whether the lead had engaged (sent at least one inbound message) before escalation. */
  lead_engaged: boolean;
  /** Most recent messages (oldest→newest) for quick triage context. */
  recent_messages: Array<{ direction: string; sender_type: string; body_text: string; at: string }>;
  occurred_at: string;
}

export interface EscalationNotifyResult {
  delivered: boolean;
  /** True when no webhook is configured, so nothing was attempted. */
  skipped: boolean;
}

/** How many trailing messages to render in the notification. */
const MESSAGE_PREVIEW_COUNT = 5;
const MESSAGE_PREVIEW_CHARS = 140;

const REASON_LABELS: Record<string, string> = {
  ai_escalation: 'AI escalation',
  no_assigned_calendar: 'No calendar assigned to campaign',
  ambiguous_calendar_selection: 'Ambiguous calendar selection',
};

/**
 * Resolve the escalation webhook URL. Prefers a dedicated ESCALATION_WEBHOOK_URL
 * but falls back to GOOGLE_CHAT_WEBHOOK_URL (the error-reporting webhook) so the
 * feature works with zero new configuration. `workspaceId` is reserved for the
 * planned per-workspace override (see module docs).
 */
export function resolveEscalationWebhookUrl(_workspaceId?: string): string | null {
  const url = (process.env.ESCALATION_WEBHOOK_URL ?? process.env.GOOGLE_CHAT_WEBHOOK_URL)?.trim();
  return url && url.length > 0 ? url : null;
}

/** Build the human-readable notification text (Google Chat / Slack markdown). */
export function formatEscalationText(payload: EscalationNotification): string {
  const leadName = [payload.lead.first_name, payload.lead.last_name].filter(Boolean).join(' ') || 'Unknown lead';
  const reasonLabel = REASON_LABELS[payload.reason] ?? payload.reason;

  const lines = [
    `*🔔 Conversation needs a human* — ${reasonLabel}`,
    `*Lead:* ${leadName} (${payload.lead.phone})`,
    `*Qualification:* ${payload.qualification_state ?? 'unknown'} · *Wanted to book:* ${payload.should_book ? 'yes' : 'no'} · *Lead engaged:* ${payload.lead_engaged ? 'yes' : 'no (never replied)'}`,
  ];

  if (payload.recent_messages.length > 0) {
    lines.push('*Recent messages:*');
    for (const m of payload.recent_messages.slice(-MESSAGE_PREVIEW_COUNT)) {
      const arrow = m.direction === 'inbound' ? '←' : '→';
      const body = m.body_text.length > MESSAGE_PREVIEW_CHARS
        ? `${m.body_text.slice(0, MESSAGE_PREVIEW_CHARS)}…`
        : m.body_text;
      lines.push(`${arrow} ${body.replace(/\n/g, ' ')}`);
    }
  }

  const baseUrl = process.env.PUBLIC_SITE_URL?.trim();
  if (baseUrl) {
    lines.push(`${baseUrl.replace(/\/$/, '')}/conversations?conversation_id=${payload.conversation_id}`);
  }

  return lines.join('\n');
}

/**
 * POST an escalation to the configured webhook as a `{ text }` message.
 *
 * - No webhook configured → returns { delivered: false, skipped: true } (the
 *   caller's job still completes; nothing to retry).
 * - Non-2xx / network error → throws, so the enclosing queue job is marked
 *   failed and retried with the queue's normal backoff.
 */
export async function notifyEscalation(payload: EscalationNotification): Promise<EscalationNotifyResult> {
  const url = resolveEscalationWebhookUrl(payload.workspace_id);
  if (!url) {
    console.warn(
      `[escalation-notify] No webhook configured (ESCALATION_WEBHOOK_URL / GOOGLE_CHAT_WEBHOOK_URL) — escalation for conversation ${payload.conversation_id} surfaced in Needs Human only`,
    );
    return { delivered: false, skipped: true };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ text: formatEscalationText(payload) }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Escalation webhook returned ${response.status}${text ? `: ${text.slice(0, 300)}` : ''}`,
    );
  }

  return { delivered: true, skipped: false };
}
