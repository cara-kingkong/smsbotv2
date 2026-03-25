import type { AIDecision, Message, Conversation, Lead } from './domain';

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
  validateWebhookSignature(headers: Record<string, string>, body: string): boolean;
  getDeliveryStatus(provider_message_id: string): Promise<string>;
}

// ─── AI Provider Adapter ─────────────────────────────────────

export interface AIPromptContext {
  system_prompt: string;
  conversation_history: Pick<Message, 'direction' | 'sender_type' | 'body_text'>[];
  lead: Pick<Lead, 'first_name' | 'last_name' | 'timezone'>;
  available_calendar_ids: string[];
  rules: Record<string, unknown>;
}

export interface AIProviderAdapter {
  generateReply(context: AIPromptContext): Promise<AIDecision>;
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
  lead_name: string;
  lead_email: string;
  lead_phone: string;
  notes?: string;
}

export interface BookingResult {
  booking_id: string;
  booking_url: string;
  scheduled_at: string;
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
    last_name?: string;
    email?: string;
    timezone?: string;
    external_contact_id?: string;
    tags?: string[];
    custom_fields?: Record<string, unknown>;
  };
  source_metadata?: Record<string, unknown>;
}
