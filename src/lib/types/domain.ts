import type {
  ConversationStatus,
  ConversationOutcome,
  MessageDirection,
  SenderType,
  IntegrationType,
  IntegrationProvider,
  EntityStatus,
  WorkspaceRole,
  JobStatus,
  CRMEventType,
  CRMSyncStatus,
  ConversationEventType,
  QualificationState,
} from './enums';

// ─── Workspace ───────────────────────────────────────────────

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  status: EntityStatus;
  business_hours_json: BusinessHours | Record<string, never>;
  stop_conditions_json: StopConditions | Record<string, never>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  auth_provider: string;
  created_at: string;
}

export interface WorkspaceUser {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
}

// ─── Integration ─────────────────────────────────────────────

export interface Integration {
  id: string;
  workspace_id: string;
  type: IntegrationType;
  provider: IntegrationProvider;
  name: string;
  status: EntityStatus;
  config_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ─── Campaign ────────────────────────────────────────────────

export interface BusinessHours {
  timezone: string;
  schedule: {
    day: number; // 0=Sun … 6=Sat
    start: string; // "09:00"
    end: string; // "17:00"
  }[];
}

export interface StopConditions {
  max_messages: number;
  max_days: number;
  max_no_reply_hours: number;
}

export interface Campaign {
  id: string;
  workspace_id: string;
  name: string;
  status: EntityStatus;
  business_hours_json: BusinessHours;
  stop_conditions_json: StopConditions;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ─── Agent ───────────────────────────────────────────────────

export interface Agent {
  id: string;
  campaign_id: string;
  name: string;
  status: EntityStatus;
  ai_provider_integration_id: string | null;
  weight: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ReplyCadence {
  initial_delay_seconds: number;
  followup_delay_seconds: number;
  max_followups: number;
}

export interface AgentVersion {
  id: string;
  agent_id: string;
  version_number: number;
  prompt_text: string;
  system_rules_json: Record<string, unknown>;
  reply_cadence_json: ReplyCadence;
  config_json: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

// ─── Calendar ────────────────────────────────────────────────

export interface Calendar {
  id: string;
  workspace_id: string;
  integration_id: string;
  name: string;
  booking_url: string;
  eligibility_rules_json: Record<string, unknown>;
  status: EntityStatus;
  created_at: string;
}

export interface AgentCalendar {
  id: string;
  agent_id: string;
  calendar_id: string;
}

// ─── Lead ────────────────────────────────────────────────────

export interface Lead {
  id: string;
  workspace_id: string;
  external_contact_id: string | null;
  crm_provider: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone_e164: string;
  timezone: string | null;
  status: EntityStatus;
  opted_out: boolean;
  source_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ─── Conversation ────────────────────────────────────────────

export interface Conversation {
  id: string;
  workspace_id: string;
  campaign_id: string;
  agent_id: string;
  agent_version_id: string;
  lead_id: string;
  status: ConversationStatus;
  outcome: ConversationOutcome | null;
  needs_human: boolean;
  human_controlled: boolean;
  opened_at: string;
  last_activity_at: string;
  paused_until: string | null;
  closed_at: string | null;
  deleted_at: string | null;
}

// ─── Message ─────────────────────────────────────────────────

export interface Message {
  id: string;
  conversation_id: string;
  direction: MessageDirection;
  sender_type: SenderType;
  body_text: string;
  provider_message_id: string | null;
  provider_status: string | null;
  error_json: Record<string, unknown> | null;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
}

// ─── Events ──────────────────────────────────────────────────

export interface ConversationEvent {
  id: string;
  conversation_id: string;
  event_type: ConversationEventType;
  event_payload_json: Record<string, unknown>;
  created_at: string;
}

export interface CRMEvent {
  id: string;
  workspace_id: string;
  conversation_id: string;
  integration_id: string;
  event_type: CRMEventType;
  status: CRMSyncStatus;
  request_payload_json: Record<string, unknown>;
  response_payload_json: Record<string, unknown> | null;
  retry_count: number;
  created_at: string;
}

// ─── Webhook ─────────────────────────────────────────────────

export interface WebhookReceipt {
  id: string;
  workspace_id: string;
  source_type: string;
  source_identifier: string;
  idempotency_key: string;
  payload_json: Record<string, unknown>;
  processed_status: string;
  created_at: string;
}

// ─── Job Queue ───────────────────────────────────────────────

export interface Job {
  id: string;
  job_type: string;
  queue_name: string;
  status: JobStatus;
  payload_json: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  run_at: string;
  last_error: string | null;
  dead_lettered_at: string | null;
  created_at: string;
}

// ─── Activity Log ────────────────────────────────────────────

export interface ActivityLog {
  id: string;
  workspace_id: string;
  user_id: string | null;
  entity_type: string;
  entity_id: string;
  action_type: string;
  metadata_json: Record<string, unknown>;
  created_at: string;
}

// ─── AI Decision ─────────────────────────────────────────────

export interface AIDecision {
  should_reply: boolean;
  reply_text: string;
  qualification_state: QualificationState;
  should_book: boolean;
  recommended_calendar_id: string | null;
  escalate_to_human: boolean;
  tags_to_emit: string[];
  confidence_notes: string[];
  reason_summary: string;
}
