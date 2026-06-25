import type { AIDecision, Message, Lead } from './domain';

// ─── SMS Adapter ─────────────────────────────────────────────

export interface SendMessageInput {
  to: string;
  from: string;
  body: string;
  conversation_id: string;
}

export interface SendMessageResult {
  provider_message_id: string;
  status: string;
  raw_response: Record<string, unknown>;
}

export interface InboundMessagePayload {
  from: string;
  to: string;
  body: string;
  provider_message_id: string;
  raw_payload: Record<string, unknown>;
}

export interface SMSAdapter {
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
  parseInboundWebhook(body: Record<string, unknown>): InboundMessagePayload;
  validateWebhookSignature(requestUrl: string, headers: Headers, body: Record<string, string>): boolean;
  getDeliveryStatus(provider_message_id: string): Promise<string>;
}

// ─── AI Provider Adapter ─────────────────────────────────────

export interface AIPromptContext {
  system_prompt: string;
  conversation_history: Pick<Message, 'direction' | 'sender_type' | 'body_text'>[];
  lead: Pick<Lead, 'first_name' | 'last_name' | 'timezone'>;
  available_calendar_ids: string[];
  available_calendars: Array<{ id: string; name: string }>;
  available_slots?: string[];
  /** Model id from the agent's config_json. Adapter falls back to its default when unset. */
  model?: string;
  /** Sampling temperature from the agent's config_json. */
  temperature?: number;
  /**
   * Set when the lead's most recent inbound message looks like an emoji
   * reaction or tapback (not a real message). The model uses this to decide
   * whether a reply is natural — usually it isn't.
   */
  latest_inbound_reaction?: { kind: 'tapback' | 'emoji'; description: string };
  /**
   * Set when this generation was triggered by the follow-up cadence (the lead
   * has gone silent), not by an inbound message. `number` is which consecutive
   * nudge this is (1-based) and `total` is the configured max_followups, so the
   * model can escalate tone from a gentle nudge to a graceful final check-in and
   * — crucially — knows NOT to just repeat its previous message.
   */
  followup?: { number: number; total: number };
  /**
   * Set when a previous generation on this same turn tried to offer times or
   * book before the lead was qualified, and the system blocked it. Tells the
   * model the lead is NOT yet qualified per its own rules: it must keep
   * qualifying and must NOT offer times or book this turn. This backs the
   * code-level qualification gate so the next message continues qualifying
   * instead of repeating a premature "I'll get you booked in" line.
   */
  booking_blocked?: boolean;
}

export interface OpeningMessageContext {
  /**
   * The opening message: either a near-final draft or prompt-style instructions
   * with conditional variants. Merge fields are already substituted.
   */
  message: string;
  first_name?: string | null;
  /** Short description of why we're reaching out (from the lead's source metadata),
   *  used by the model to pick the right conditional variant. */
  context?: string;
  /** Provider model id to use for the lightweight personalization call. */
  model?: string;
}

export interface HoldingLineContext {
  /**
   * Recent conversation so the holding line can acknowledge what the lead just
   * said instead of reading as a canned, context-free auto-reply.
   */
  conversation_history: Array<{ direction: string; sender_type: string; body_text: string }>;
  first_name?: string | null;
  /** Why we're handing off (e.g. 'ai_escalation', 'ai_no_action') — steers tone. */
  reason?: string;
  /** Provider model id to use for the lightweight generation call. */
  model?: string;
}

export interface AIProviderAdapter {
  generateReply(context: AIPromptContext): Promise<AIDecision>;
  /**
   * Lightly personalize a semi-static opening SMS using a cheap model.
   * No decision schema, no conversation context — just rephrase/insert the name.
   */
  generateOpening?(context: OpeningMessageContext): Promise<string>;
  /**
   * Write a single short, natural "I'll get back to you" holding SMS when the
   * thread is being handed to a human. Acknowledges the lead's last message so it
   * doesn't read like a canned line. Uses a cheap model. Plain text, no links.
   */
  generateHoldingLine?(context: HoldingLineContext): Promise<string>;
  /**
   * Summarize the lead's situation (revenue, marketing budget, goals, etc.) from
   * a conversation transcript, for a sales rep reading the contact in their CRM.
   * Uses a cheap model. Returns plain text built only from facts the lead stated.
   */
  summarizeSituation?(transcript: string): Promise<string>;
}

// ─── CRM Adapter ─────────────────────────────────────────────

export interface CRMApplyTagInput {
  external_contact_id: string;
  tag_name: string;
}

export interface CRMCreateNoteInput {
  external_contact_id: string;
  note_body: string;
}

export interface CRMAdapter {
  applyTag(input: CRMApplyTagInput): Promise<{ success: boolean; raw_response: Record<string, unknown> }>;
  createNote(input: CRMCreateNoteInput): Promise<{ success: boolean; raw_response: Record<string, unknown> }>;
  healthCheck(): Promise<{ ok: boolean; message: string }>;
}

// ─── Calendar Adapter ────────────────────────────────────────

export interface BookingInput {
  calendar_id: string;
  start_time: string;
  lead_name: string;
  lead_email: string;
  lead_phone: string;
  lead_timezone?: string;
  lead_company?: string;
}

export interface BookingResult {
  booking_id: string;
  booking_url: string;
  scheduled_at: string;
  event_uri?: string;
  cancel_url?: string;
  reschedule_url?: string;
  raw_response: Record<string, unknown>;
}

export interface CalendarAdapter {
  listAvailableSlots(calendar_id: string, date_range: { start: string; end: string }): Promise<{ slots: string[] }>;
  createBooking(input: BookingInput): Promise<BookingResult>;
  cancelBooking(booking_id: string): Promise<{ success: boolean }>;
  healthCheck(): Promise<{ ok: boolean; message: string }>;
}

// ─── Webhook Start Conversation ──────────────────────────────

export interface StartConversationWebhookPayload {
  workspace_id: string;
  campaign_id: string;
  idempotency_key?: string;
  lead: {
    phone: string;
    first_name: string;
    email: string;
    timezone: string;
    last_name?: string;
    external_contact_id?: string;
    crm_provider?: string;
    tags?: string[];
    custom_fields?: Record<string, unknown>;
  };
  source_metadata?: Record<string, unknown>;
}
