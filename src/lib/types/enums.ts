/** Conversation lifecycle status */
export enum ConversationStatus {
  Queued = 'queued',
  Active = 'active',
  WaitingForLead = 'waiting_for_lead',
  PausedBusinessHours = 'paused_business_hours',
  PausedManual = 'paused_manual',
  NeedsHuman = 'needs_human',
  HumanControlled = 'human_controlled',
  Completed = 'completed',
  OptedOut = 'opted_out',
  Failed = 'failed',
}

/** Terminal conversation outcome */
export enum ConversationOutcome {
  Booked = 'booked',
  QualifiedNotBooked = 'qualified_not_booked',
  Unqualified = 'unqualified',
  NoResponse = 'no_response',
  OptedOut = 'opted_out',
  HumanTakeover = 'human_takeover',
  Other = 'other',
}

/** SMS message direction */
export enum MessageDirection {
  Inbound = 'inbound',
  Outbound = 'outbound',
}

/** Who sent the message */
export enum SenderType {
  Lead = 'lead',
  AI = 'ai',
  Human = 'human',
  System = 'system',
}

/** Category of workspace integration */
export enum IntegrationType {
  CRM = 'crm',
  Calendar = 'calendar',
  SMS = 'sms',
  AIProvider = 'ai_provider',
}

/** Supported provider identifiers */
export enum IntegrationProvider {
  Twilio = 'twilio',
  Calendly = 'calendly',
  Keap = 'keap',
  OpenAI = 'openai',
  Anthropic = 'anthropic',
}

/** Workspace-level entity status */
export enum EntityStatus {
  Active = 'active',
  Paused = 'paused',
  Archived = 'archived',
  Deleted = 'deleted',
}

/** Workspace user role */
export enum WorkspaceRole {
  Owner = 'owner',
  Admin = 'admin',
  Manager = 'manager',
  ReadOnly = 'read_only',
}

/** Job processing status */
export enum JobStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
  DeadLettered = 'dead_lettered',
  Cancelled = 'cancelled',
}

/** CRM outcome event types */
export enum CRMEventType {
  ConversationBooked = 'conversation_booked',
  ConversationQualified = 'conversation_qualified',
  ConversationUnqualified = 'conversation_unqualified',
  ConversationOptedOut = 'conversation_opted_out',
  ConversationNeedsHuman = 'conversation_needs_human',
  ConversationMessageSent = 'conversation_message_sent',
}

/** CRM sync status */
export enum CRMSyncStatus {
  Pending = 'pending',
  Sent = 'sent',
  Failed = 'failed',
  Retrying = 'retrying',
}

/** Conversation event types for audit trail */
export enum ConversationEventType {
  Created = 'created',
  AgentAssigned = 'agent_assigned',
  MessageSent = 'message_sent',
  MessageReceived = 'message_received',
  AIReplyGenerated = 'ai_reply_generated',
  FollowupSent = 'followup_sent',
  StopConditionReached = 'stop_condition_reached',
  QualificationChanged = 'qualification_changed',
  SlotsOffered = 'slots_offered',
  BookingInitiated = 'booking_initiated',
  BookingConfirmed = 'booking_confirmed',
  BookingFailed = 'booking_failed',
  // Booking lifecycle (string values are stable — persisted + queried as-is).
  BookingQueued = 'booking_queued',
  BookingReference = 'booking_reference',
  BookingCancelled = 'booking_cancelled',
  BookingNeedsHuman = 'booking_needs_human',
  BookingAcceptanceDetected = 'booking_acceptance_detected',
  BookingPromiseRescued = 'booking_promise_rescued',
  BookingBlockedUnqualified = 'booking_blocked_unqualified',
  BookingTimeUnavailable = 'booking_time_unavailable',
  BookingReAttemptBlocked = 'booking_re_attempt_blocked',
  // Operator manually recorded a `booked` outcome (no booking automation ran).
  BookingMarkedManual = 'booking_marked_manual',
  BookingCloseoutQueued = 'booking_closeout_queued',
  BookingCloseoutFailed = 'booking_closeout_failed',
  // Post-close / re-engagement + lead profile updates.
  MessageAfterBooking = 'message_after_booking',
  ReopenedClosedConversation = 'reopened_closed_conversation',
  LeadTimezoneUpdated = 'lead_timezone_updated',
  HumanTakeover = 'human_takeover',
  HumanRelease = 'human_release',
  ManualReplyTriggered = 'manual_reply_triggered',
  HoldingLineSent = 'holding_line_sent',
  EscalationNotified = 'escalation_notified',
  Paused = 'paused',
  Resumed = 'resumed',
  OptedOut = 'opted_out',
  AIOptOutDetected = 'ai_opt_out_detected',
  Completed = 'completed',
  Failed = 'failed',
}

/** AI qualification assessment */
export enum QualificationState {
  Unknown = 'unknown',
  Exploring = 'exploring',
  Qualified = 'qualified',
  Unqualified = 'unqualified',
  NeedsMoreInfo = 'needs_more_info',
}
