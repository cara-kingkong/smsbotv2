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
  is_platform_admin: boolean;
  created_at: string;
}

export interface WorkspaceUser {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  created_at: string;
}

// ─── Workspace Phone Numbers ─────────────────────────────────

export interface WorkspacePhoneNumber {
  id: string;
  workspace_id: string;
  e164: string;
  country_code: string; // ISO-2, e.g. 'AU', 'US'
  label: string;
  is_default: boolean;
  provider: string;
  created_at: string;
  updated_at: string;
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
  description: string | null;
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
  /** Seconds to wait for additional rapid-fire messages before generating a reply.
   *  Each new inbound message resets the timer. Default 8s. */
  coalesce_window_seconds?: number;
}

export interface AllowedActions {
  can_book: boolean;
  can_escalate_to_human: boolean;
  can_close_unqualified: boolean;
}

export interface QualificationRules {
  required_fields: string[];
}

export interface AgentVersion {
  id: string;
  agent_id: string;
  version_number: number;
  prompt_text: string;
  system_rules_json: Record<string, unknown>;
  reply_cadence_json: ReplyCadence;
  allowed_actions_json: AllowedActions;
  qualification_rules_json: QualificationRules;
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
  external_calendar_id: string | null;
  booking_url: string | null;
  eligibility_rules_json: EligibilityRules | Record<string, never>;
  settings_json: Record<string, unknown>;
  status: EntityStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface EligibilityRules {
  required_tags?: string[];
  required_fields?: string[];
  rules?: EligibilityRule[];
}

export interface EligibilityRule {
  field: string;
  operator: '>=' | '<=' | '==' | '!=' | 'contains';
  value: string | number;
}

export interface AgentCalendar {
  id: string;
  workspace_id: string;
  agent_id: string;
  calendar_id: string;
  created_at: string;
}

export interface CampaignCalendar {
  id: string;
  workspace_id: string;
  campaign_id: string;
  calendar_id: string;
  created_at: string;
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
  source_job_id: string | null;
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
  workspace_id: string | null;
  job_type: string;
  queue_name: string;
  status: JobStatus;
  payload_json: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  started_at: string | null;
  heartbeat_at: string | null;
  lease_expires_at: string | null;
  completed_at: string | null;
  worker_id: string | null;
  run_at: string;
  last_error: string | null;
  last_error_at: string | null;
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
  should_offer_times: boolean;
  should_book: boolean;
  should_cancel_booking: boolean;
  confirmed_time: string | null;
  recommended_calendar_id: string | null;
  escalate_to_human: boolean;
  tags_to_emit: string[];
  confidence_notes: string[];
  reason_summary: string;
}
