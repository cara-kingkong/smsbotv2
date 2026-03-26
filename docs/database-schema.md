
# database-schema.md

## Purpose
This document defines the first-pass database schema for the multi-workspace SMS chatbot platform.

It is written for:
- human engineers
- AI coding agents
- schema planning
- migration planning
- backend service implementation
- reporting design

This is not final SQL.
This is the canonical schema design document that should be converted into SQL migrations.

---

# 1. Schema Design Principles

## 1.1 Primary Goals
The schema must:
- support multi-workspace isolation
- preserve historical agent/version behavior
- support async and retryable workflows
- support provider abstraction
- support auditability
- support reporting from persisted facts
- be explicit enough for AI coding agents to implement safely

## 1.2 Key Design Rules
1. All workspace-owned records must carry `workspace_id` unless there is a very strong reason not to.
2. Provider-specific data should be stored in structured fields without leaking provider assumptions into core tables.
3. Historical records must not be overwritten when history matters for reporting.
4. Conversation state must be reconstructable from source records and events.
5. Side effects should be backed by explicit receipts, events, or jobs.
6. Soft deletion should be used where recovery/audit is useful.
7. Enums should be explicit and centralized.

## 1.3 Recommended Database
Use Supabase Postgres.

Recommended features:
- UUID primary keys
- `timestamptz` timestamps
- JSONB for provider payloads/config blobs
- partial indexes for active records
- foreign keys for core relationships
- check constraints where domain rules are simple and stable
- row-level security later if desired, but do not rely on RLS alone for workspace safety

---

# 2. Naming Conventions

## 2.1 Table Naming
Use plural snake_case table names.

Examples:
- `workspaces`
- `workspace_users`
- `campaigns`
- `agent_versions`
- `conversation_events`

## 2.2 Column Naming
Use snake_case columns.

Common columns:
- `id`
- `workspace_id`
- `created_at`
- `updated_at`
- `deleted_at`
- `status`
- `payload_json`
- `config_json`

## 2.3 ID Convention
Use UUID primary keys for application tables.

Recommendation:
- `id uuid primary key default gen_random_uuid()`

---

# 3. Core Enum Definitions

These should be implemented as Postgres enums or constrained text values.
If speed matters, constrained text is acceptable initially, but enums are preferred when stable.

## 3.1 workspace_status
Values:
- `active`
- `inactive`
- `archived`

## 3.2 workspace_role
Values:
- `owner`
- `admin`
- `manager`
- `read_only`

## 3.3 campaign_status
Values:
- `draft`
- `active`
- `paused`
- `archived`

## 3.4 agent_status
Values:
- `draft`
- `active`
- `paused`
- `archived`

## 3.5 integration_type
Values:
- `sms`
- `crm`
- `calendar`
- `ai_provider`

## 3.6 integration_provider
Initial values:
- `twilio`
- `keap`
- `calendly`
- `openai`
- `anthropic`

## 3.7 integration_status
Values:
- `active`
- `inactive`
- `error`
- `pending`

## 3.8 lead_status
Values:
- `active`
- `inactive`
- `suppressed`

## 3.9 conversation_status
Values:
- `queued`
- `active`
- `waiting_for_lead`
- `paused_business_hours`
- `paused_manual`
- `needs_human`
- `human_controlled`
- `completed`
- `opted_out`
- `failed`

## 3.10 conversation_outcome
Values:
- `booked`
- `qualified_not_booked`
- `unqualified`
- `no_response`
- `opted_out`
- `human_takeover`
- `other`

## 3.11 message_direction
Values:
- `inbound`
- `outbound`

## 3.12 message_sender_type
Values:
- `lead`
- `ai`
- `human`
- `system`

## 3.13 message_delivery_status
Values:
- `queued`
- `sent`
- `delivered`
- `failed`
- `undelivered`
- `received`

## 3.14 job_status
Values:
- `queued`
- `processing`
- `completed`
- `failed`
- `dead_lettered`
- `cancelled`

## 3.15 crm_event_status
Values:
- `queued`
- `processing`
- `completed`
- `failed`
- `dead_lettered`

## 3.16 webhook_processed_status
Values:
- `received`
- `validated`
- `processed`
- `duplicate`
- `failed`

---

# 4. Core Tables

# 4.1 workspaces
Purpose:
Represents a business or business unit.

## Columns
- `id` uuid pk
- `name` text not null
- `slug` text not null unique
- `status` workspace_status not null default `active`
- `settings_json` jsonb not null default '{}'::jsonb
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()
- `deleted_at` timestamptz null

## Notes
- `slug` should be unique globally.
- `settings_json` can hold workspace-wide defaults that are not important enough for dedicated columns yet.

## Suggested Indexes
- unique index on `slug`
- index on `status` where `deleted_at is null`

---

# 4.2 users
Purpose:
Represents an authenticated application user.

## Columns
- `id` uuid pk
- `email` citext not null unique
- `full_name` text null
- `auth_provider` text null
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

## Notes
- If using Supabase Auth, this may mirror auth identities.
- `email` should be case-insensitive.

## Suggested Indexes
- unique index on `email`

---

# 4.3 workspace_users
Purpose:
Joins users to workspaces.

## Columns
- `id` uuid pk
- `workspace_id` uuid not null references `workspaces(id)`
- `user_id` uuid not null references `users(id)`
- `role` workspace_role not null default `admin`
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

## Rules
- A user may belong to many workspaces.
- A workspace may have many users.
- A user should not appear twice in the same workspace.

## Suggested Constraints
- unique (`workspace_id`, `user_id`)

## Suggested Indexes
- index on `workspace_id`
- index on `user_id`

---

# 4.4 integrations
Purpose:
Stores installed provider integrations for a workspace.

## Columns
- `id` uuid pk
- `workspace_id` uuid not null references `workspaces(id)`
- `type` integration_type not null
- `provider` integration_provider not null
- `name` text not null
- `status` integration_status not null default `pending`
- `config_json` jsonb not null default '{}'::jsonb
- `secrets_ref` text null
- `last_healthcheck_at` timestamptz null
- `last_healthcheck_status` text null
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()
- `deleted_at` timestamptz null

## Notes
- `config_json` stores non-secret configuration.
- `secrets_ref` points to secret storage; do not store secrets directly in plaintext table columns if avoidable.
- One workspace may have multiple integrations of the same type/provider later.

## Suggested Indexes
- index on `workspace_id`
- index on (`workspace_id`, `type`) where `deleted_at is null`
- index on (`workspace_id`, `provider`) where `deleted_at is null`

---

# 4.5 campaigns
Purpose:
Defines a lead handling context within a workspace.

## Columns
- `id` uuid pk
- `workspace_id` uuid not null references `workspaces(id)`
- `name` text not null
- `slug` text null
- `status` campaign_status not null default `draft`
- `description` text null
- `business_hours_json` jsonb not null default '{}'::jsonb
- `stop_conditions_json` jsonb not null default '{}'::jsonb
- `settings_json` jsonb not null default '{}'::jsonb
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()
- `deleted_at` timestamptz null

## Notes
- `business_hours_json` should be structured and documented, not arbitrary free-form JSON.
- `slug` may be unique within a workspace, not necessarily globally.

## Suggested Constraints
- unique (`workspace_id`, `slug`) where `slug is not null`

## Suggested Indexes
- index on `workspace_id`
- index on (`workspace_id`, `status`) where `deleted_at is null`

---

# 4.6 agents
Purpose:
Represents a split-testable AI configuration container under a campaign.

## Columns
- `id` uuid pk
- `workspace_id` uuid not null references `workspaces(id)`
- `campaign_id` uuid not null references `campaigns(id)`
- `name` text not null
- `status` agent_status not null default `draft`
- `ai_provider_integration_id` uuid null references `integrations(id)`
- `weight` integer not null default 100
- `description` text null
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()
- `deleted_at` timestamptz null

## Rules
- An agent belongs to one campaign.
- A campaign may have multiple agents.
- `weight` must be positive.

## Suggested Constraints
- check (`weight > 0`)

## Suggested Indexes
- index on `workspace_id`
- index on `campaign_id`
- index on (`campaign_id`, `status`) where `deleted_at is null`

## Important Design Note
`workspace_id` is intentionally duplicated here for easier workspace scoping and querying.
Application logic and migrations must ensure `agents.workspace_id` matches `campaigns.workspace_id`.

---

# 4.7 agent_versions
Purpose:
Preserves historical prompt/config versions for agents.

## Columns
- `id` uuid pk
- `workspace_id` uuid not null references `workspaces(id)`
- `agent_id` uuid not null references `agents(id)`
- `version_number` integer not null
- `prompt_text` text not null
- `system_rules_json` jsonb not null default '{}'::jsonb
- `reply_cadence_json` jsonb not null default '{}'::jsonb
- `allowed_actions_json` jsonb not null default '{}'::jsonb
- `qualification_rules_json` jsonb not null default '{}'::jsonb
- `config_json` jsonb not null default '{}'::jsonb
- `is_active` boolean not null default false
- `created_at` timestamptz not null default now()
- `created_by_user_id` uuid null references `users(id)`

## Rules
- Version numbers are unique per agent.
- Only one version should be active per agent at a time.
- Conversations must persist which version they used.

## Suggested Constraints
- unique (`agent_id`, `version_number`)

## Suggested Indexes
- index on `workspace_id`
- index on `agent_id`
- unique index on (`agent_id`) where `is_active = true`

---

# 4.8 calendars
Purpose:
Represents a bookable calendar target exposed through an integration.

## Columns
- `id` uuid pk
- `workspace_id` uuid not null references `workspaces(id)`
- `integration_id` uuid not null references `integrations(id)`
- `name` text not null
- `external_calendar_id` text null
- `booking_url` text null
- `eligibility_rules_json` jsonb not null default '{}'::jsonb
- `settings_json` jsonb not null default '{}'::jsonb
- `status` text not null default 'active'
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()
- `deleted_at` timestamptz null

## Notes
- `status` may become an enum later.
- `eligibility_rules_json` should be designed for deterministic validation where practical.

## Suggested Indexes
- index on `workspace_id`
- index on `integration_id`
- index on (`workspace_id`, `status`) where `deleted_at is null`

---

# 4.9 agent_calendars
Purpose:
Assigns one or more calendars to an agent.

## Columns
- `id` uuid pk
- `workspace_id` uuid not null references `workspaces(id)`
- `agent_id` uuid not null references `agents(id)`
- `calendar_id` uuid not null references `calendars(id)`
- `created_at` timestamptz not null default now()

## Rules
- An agent may have many calendars.
- A calendar may be assigned to many agents.
- The same agent/calendar pair should not be duplicated.

## Suggested Constraints
- unique (`agent_id`, `calendar_id`)

## Suggested Indexes
- index on `workspace_id`
- index on `agent_id`
- index on `calendar_id`

---

# 4.10 leads
Purpose:
Represents the contact being messaged.

## Columns
- `id` uuid pk
- `workspace_id` uuid not null references `workspaces(id)`
- `external_contact_id` text null
- `crm_provider` integration_provider null
- `first_name` text null
- `last_name` text null
- `display_name` text null
- `email` citext null
- `phone_e164` text not null
- `timezone` text null
- `status` lead_status not null default `active`
- `opted_out` boolean not null default false
- `source_json` jsonb not null default '{}'::jsonb
- `attributes_json` jsonb not null default '{}'::jsonb
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()
- `deleted_at` timestamptz null

## Rules
- A lead is workspace-scoped.
- Leads may exist without CRM-native IDs in MVP.
- Phone number should be normalized to E.164.

## Suggested Constraints
- unique (`workspace_id`, `phone_e164`) where `deleted_at is null`

## Suggested Indexes
- index on `workspace_id`
- index on (`workspace_id`, `external_contact_id`) where `external_contact_id is not null`
- index on (`workspace_id`, `email`) where `email is not null`
- index on (`workspace_id`, `phone_e164`)

## Important Note
If future product requirements need multiple lead records per phone number within a workspace, revisit this uniqueness rule. For MVP, one canonical lead per workspace/phone is the safest choice.

---

# 4.11 conversations
Purpose:
Represents an operational SMS conversation with a lead.

## Columns
- `id` uuid pk
- `workspace_id` uuid not null references `workspaces(id)`
- `campaign_id` uuid not null references `campaigns(id)`
- `agent_id` uuid not null references `agents(id)`
- `agent_version_id` uuid not null references `agent_versions(id)`
- `lead_id` uuid not null references `leads(id)`
- `status` conversation_status not null default `queued`
- `outcome` conversation_outcome null
- `needs_human` boolean not null default false
- `human_controlled` boolean not null default false
- `assigned_user_id` uuid null references `users(id)`
- `source_type` text not null default 'webhook'
- `source_reference` text null
- `opened_at` timestamptz not null default now()
- `last_activity_at` timestamptz not null default now()
- `paused_until` timestamptz null
- `closed_at` timestamptz null
- `deleted_at` timestamptz null

## Rules
- A conversation belongs to one lead, campaign, agent, and agent version.
- `agent_version_id` must always be stored.
- Status and outcome are separate fields.

## Suggested Indexes
- index on `workspace_id`
- index on `campaign_id`
- index on `agent_id`
- index on `lead_id`
- index on (`workspace_id`, `status`) where `deleted_at is null`
- index on (`workspace_id`, `last_activity_at desc`) where `deleted_at is null`
- index on (`workspace_id`, `needs_human`) where `deleted_at is null`
- index on (`workspace_id`, `human_controlled`) where `deleted_at is null`

## Partial Index Recommendation
To help enforce “one conflicting active conversation per lead”, create an index or application rule using the set of active statuses.

Example active statuses:
- `queued`
- `active`
- `waiting_for_lead`
- `paused_business_hours`
- `paused_manual`
- `needs_human`
- `human_controlled`

Possible partial unique index concept:
- unique (`lead_id`) where status in active statuses and deleted_at is null

Only do this if business rules truly allow only one active conversation per lead across all campaigns.
If the rule becomes campaign-specific later, revise accordingly.

---

# 4.12 messages
Purpose:
Stores inbound and outbound messages for a conversation.

## Columns
- `id` uuid pk
- `workspace_id` uuid not null references `workspaces(id)`
- `conversation_id` uuid not null references `conversations(id)`
- `direction` message_direction not null
- `sender_type` message_sender_type not null
- `body_text` text not null
- `provider_message_id` text null
- `delivery_status` message_delivery_status not null default `queued`
- `error_json` jsonb not null default '{}'::jsonb
- `metadata_json` jsonb not null default '{}'::jsonb
- `sent_at` timestamptz null
- `received_at` timestamptz null
- `created_at` timestamptz not null default now()

## Rules
- All transcripted content should be preserved.
- Inbound messages should typically use `received_at`.
- Outbound messages should typically use `sent_at`.

## Suggested Indexes
- index on `workspace_id`
- index on `conversation_id`
- index on (`conversation_id`, `created_at`)
- index on `provider_message_id` where `provider_message_id is not null`
- index on (`workspace_id`, `delivery_status`)

---

# 4.13 conversation_events
Purpose:
Append-only event log of meaningful conversation state changes or decisions.

## Columns
- `id` uuid pk
- `workspace_id` uuid not null references `workspaces(id)`
- `conversation_id` uuid not null references `conversations(id)`
- `event_type` text not null
- `event_payload_json` jsonb not null default '{}'::jsonb
- `created_at` timestamptz not null default now()
- `created_by_user_id` uuid null references `users(id)`

## Example Event Types
- `conversation_started`
- `message_received`
- `message_queued`
- `message_sent`
- `ai_decision_recorded`
- `status_changed`
- `outcome_changed`
- `human_takeover_started`
- `human_takeover_released`
- `booking_recommended`
- `booking_created`
- `crm_event_queued`

## Suggested Indexes
- index on `workspace_id`
- index on `conversation_id`
- index on (`conversation_id`, `created_at`)
- index on `event_type`

## Important Note
This table is critical for reporting and auditability. Prefer appending events over trying to infer everything later from mutable current-state rows.

---

# 4.14 ai_decisions
Purpose:
Stores structured outputs from the AI layer separately from human-readable messages.

## Columns
- `id` uuid pk
- `workspace_id` uuid not null references `workspaces(id)`
- `conversation_id` uuid not null references `conversations(id)`
- `message_id` uuid null references `messages(id)`
- `agent_version_id` uuid not null references `agent_versions(id)`
- `provider_integration_id` uuid null references `integrations(id)`
- `model_name` text null
- `input_json` jsonb not null default '{}'::jsonb
- `decision_json` jsonb not null default '{}'::jsonb
- `raw_response_json` jsonb not null default '{}'::jsonb
- `created_at` timestamptz not null default now()

## Why This Exists
Do not hide AI reasoning decisions inside only `conversation_events` or `messages`.
A dedicated table makes it easier to:
- audit AI behavior
- compare agent variants
- debug bad decisions
- extract reporting on decisions vs outcomes

## Suggested Indexes
- index on `workspace_id`
- index on `conversation_id`
- index on `agent_version_id`
- index on `provider_integration_id`

---

# 4.15 webhook_receipts
Purpose:
Stores inbound webhook receipts for idempotency, replay, and debugging.

## Columns
- `id` uuid pk
- `workspace_id` uuid null references `workspaces(id)`
- `source_type` text not null
- `source_identifier` text null
- `idempotency_key` text null
- `payload_json` jsonb not null default '{}'::jsonb
- `headers_json` jsonb not null default '{}'::jsonb
- `processed_status` webhook_processed_status not null default `received`
- `error_text` text null
- `processed_at` timestamptz null
- `created_at` timestamptz not null default now()

## Rules
- Store receipts even if validation fails when feasible.
- Not all receipts will resolve to a workspace immediately.

## Suggested Indexes
- index on `workspace_id`
- index on `source_type`
- index on `created_at`
- unique index on (`source_type`, `idempotency_key`) where `idempotency_key is not null`

---

# 4.16 crm_events
Purpose:
Stores normalized outbound CRM actions and their results.

## Columns
- `id` uuid pk
- `workspace_id` uuid not null references `workspaces(id)`
- `conversation_id` uuid null references `conversations(id)`
- `lead_id` uuid null references `leads(id)`
- `integration_id` uuid not null references `integrations(id)`
- `event_type` text not null
- `status` crm_event_status not null default `queued`
- `request_payload_json` jsonb not null default '{}'::jsonb
- `response_payload_json` jsonb not null default '{}'::jsonb
- `retry_count` integer not null default 0
- `last_error` text null
- `queued_at` timestamptz not null default now()
- `processed_at` timestamptz null
- `created_at` timestamptz not null default now()

## Example Event Types
- `apply_tag`
- `create_note`
- `upsert_contact_reference`
- `emit_outcome`

## Suggested Indexes
- index on `workspace_id`
- index on `conversation_id`
- index on `lead_id`
- index on `integration_id`
- index on (`status`, `queued_at`)

---

# 4.17 booking_events
Purpose:
Stores booking recommendations, attempts, and results.

## Columns
- `id` uuid pk
- `workspace_id` uuid not null references `workspaces(id)`
- `conversation_id` uuid not null references `conversations(id)`
- `lead_id` uuid not null references `leads(id)`
- `calendar_id` uuid null references `calendars(id)`
- `integration_id` uuid null references `integrations(id)`
- `event_type` text not null
- `status` text not null default 'queued'
- `event_payload_json` jsonb not null default '{}'::jsonb
- `external_booking_id` text null
- `created_at` timestamptz not null default now()
- `processed_at` timestamptz null

## Example Event Types
- `booking_recommended`
- `booking_validated`
- `booking_rejected`
- `booking_created`
- `booking_failed`

## Suggested Indexes
- index on `workspace_id`
- index on `conversation_id`
- index on `lead_id`
- index on `calendar_id`
- index on `integration_id`

---

# 4.18 jobs
Purpose:
Stores async jobs for queue-backed workflows.

## Columns
- `id` uuid pk
- `workspace_id` uuid null references `workspaces(id)`
- `job_type` text not null
- `queue_name` text not null
- `status` job_status not null default `queued`
- `idempotency_key` text null
- `payload_json` jsonb not null default '{}'::jsonb
- `attempts` integer not null default 0
- `max_attempts` integer not null default 5
- `run_at` timestamptz not null default now()
- `locked_at` timestamptz null
- `locked_by` text null
- `last_error` text null
- `completed_at` timestamptz null
- `dead_lettered_at` timestamptz null
- `created_at` timestamptz not null default now()
- `updated_at` timestamptz not null default now()

## Example Job Types
- `start_conversation`
- `send_sms`
- `process_inbound_sms`
- `generate_ai_reply`
- `evaluate_booking`
- `post_crm_event`
- `sync_delivery_status`

## Suggested Indexes
- index on (`status`, `run_at`)
- index on `queue_name`
- index on `workspace_id`
- unique index on (`queue_name`, `idempotency_key`) where `idempotency_key is not null`

---

# 4.19 activity_logs
Purpose:
Stores user-initiated actions for auditability.

## Columns
- `id` uuid pk
- `workspace_id` uuid not null references `workspaces(id)`
- `user_id` uuid null references `users(id)`
- `entity_type` text not null
- `entity_id` uuid null
- `action_type` text not null
- `metadata_json` jsonb not null default '{}'::jsonb
- `created_at` timestamptz not null default now()

## Example Actions
- `conversation_takeover`
- `conversation_release`
- `manual_message_sent`
- `campaign_created`
- `agent_version_activated`
- `integration_updated`

## Suggested Indexes
- index on `workspace_id`
- index on `user_id`
- index on (`entity_type`, `entity_id`)
- index on `created_at`

---

# 5. Relationship Summary

## 5.1 Main Relationships
- a workspace has many workspace_users
- a workspace has many integrations
- a workspace has many campaigns
- a workspace has many leads
- a workspace has many conversations
- a campaign has many agents
- an agent has many agent_versions
- an agent has many calendars through agent_calendars
- a lead has many conversations
- a conversation has many messages
- a conversation has many conversation_events
- a conversation has many ai_decisions
- a conversation may have many crm_events
- a conversation may have many booking_events

## 5.2 Relationship Diagram (Text Form)

```text
workspaces
  ├── workspace_users ── users
  ├── integrations
  ├── campaigns
  │     └── agents
  │           ├── agent_versions
  │           └── agent_calendars ── calendars
  ├── leads
  ├── conversations
  │     ├── messages
  │     ├── conversation_events
  │     ├── ai_decisions
  │     ├── crm_events
  │     └── booking_events
  ├── webhook_receipts
  ├── jobs
  └── activity_logs
```

---

# 6. Suggested JSON Shapes

These JSON fields should not remain undocumented. AI coding agents should create schema validation helpers for them.

## 6.1 campaigns.business_hours_json
Suggested shape:

```json
{
  "timezone_mode": "lead",
  "days": {
    "mon": [{ "start": "09:00", "end": "17:00" }],
    "tue": [{ "start": "09:00", "end": "17:00" }],
    "wed": [{ "start": "09:00", "end": "17:00" }],
    "thu": [{ "start": "09:00", "end": "17:00" }],
    "fri": [{ "start": "09:00", "end": "17:00" }]
  }
}
```

## 6.2 campaigns.stop_conditions_json
Suggested shape:

```json
{
  "opt_out_keywords": ["stop", "unsubscribe", "quit"],
  "max_outbound_without_reply": 3,
  "pause_on_human_takeover": true
}
```

## 6.3 agent_versions.reply_cadence_json
Suggested shape:

```json
{
  "initial_reply_delay_seconds": 30,
  "followup_delay_minutes": 15,
  "max_followups": 3
}
```

## 6.4 calendars.eligibility_rules_json
Suggested shape:

```json
{
  "required_tags": ["qualified"],
  "required_fields": ["budget", "service_interest"],
  "rules": [
    {
      "field": "budget",
      "operator": ">=",
      "value": 3000
    }
  ]
}
```

## 6.5 ai_decisions.decision_json
Suggested shape:

```json
{
  "should_reply": true,
  "reply_text": "Thanks, that sounds like a good fit. Want me to help you book a time?",
  "qualification_state": "qualified",
  "should_book": true,
  "recommended_calendar_id": "uuid-or-null",
  "escalate_to_human": false,
  "tags_to_emit": ["qualified"],
  "confidence_notes": ["Lead mentioned budget and timeline clearly"],
  "reason_summary": "Lead meets basic fit criteria and requested next step"
}
```

---

# 7. Constraints and Integrity Rules

## 7.1 Workspace Integrity
All records with `workspace_id` must belong to the same workspace across foreign-key-linked entities.

Examples:
- `agents.workspace_id` must match parent `campaigns.workspace_id`
- `conversations.workspace_id` must match `campaigns.workspace_id`, `agents.workspace_id`, and `leads.workspace_id`
- `agent_calendars.workspace_id` must match both `agents.workspace_id` and `calendars.workspace_id`

These are hard to fully enforce with simple SQL alone when duplicate `workspace_id` columns are used for performance/scoping.
Use a combination of:
- careful service-layer validation
- migration discipline
- optional database triggers later if needed

## 7.2 Agent Version Integrity
- only one active version per agent
- conversation must always reference an exact version
- do not update prior versions destructively

## 7.3 Lead Integrity
- normalize phone format before insert
- treat opt-out as durable state
- do not silently recreate a lead under a new row if one already exists for the workspace/phone

## 7.4 Job Integrity
- use idempotency keys for any job type that might be enqueued twice from retries or duplicate webhook deliveries

---

# 8. Reporting Considerations

## 8.1 Metrics Should Come From Durable Facts
Prefer metrics from:
- conversations.status
- conversations.outcome
- messages timestamps/statuses
- conversation_events
- ai_decisions
- booking_events
- crm_events

Avoid deriving critical metrics from only transient UI state.

## 8.2 Example Reporting Queries to Support Later
- booking rate by campaign
- booking rate by agent version
- opt-out rate by campaign
- time to first outbound response
- human takeover rate
- message volume per day
- qualification-to-booking conversion

## 8.3 Materialized Views
Not required for first release.
May be added later for dashboard speed.
Do not over-optimize reporting before event capture is trustworthy.

---

# 9. Recommended Migration Order

AI coding agents should create migrations in roughly this order:

1. enums
2. workspaces
3. users
4. workspace_users
5. integrations
6. campaigns
7. agents
8. agent_versions
9. calendars
10. agent_calendars
11. leads
12. conversations
13. messages
14. conversation_events
15. ai_decisions
16. webhook_receipts
17. crm_events
18. booking_events
19. jobs
20. activity_logs
21. indexes and partial indexes

---

# 10. Recommended Seed Data for Development

Create seed fixtures for:
- 1 workspace
- 1 admin user
- 1 Twilio integration
- 1 OpenAI integration
- 1 Keap integration
- 1 Calendly integration
- 1 campaign
- 2 agents under that campaign
- 2 agent versions
- 2 calendars
- 1 linked lead
- 1 sample conversation with messages and events

This will make AI-assisted feature building much easier because agents can test realistic flows.

---

# 11. Open Questions
These are schema-adjacent questions still to confirm.

1. Should `users` be fully separate from Supabase auth users or mirrored 1:1?
2. Should `calendars.status` become a formal enum immediately?
3. Should `booking_events.status` become a formal enum immediately?
4. Should one lead be allowed multiple simultaneous active conversations if they belong to different campaigns later?
5. Should conversation threading ever be separated from campaign assignment in future?
6. Should `integrations.provider` remain enum-backed once many providers exist, or move to constrained text?

---

# 12. Implementation Guidance for AI Coding Agents

## 12.1 What to Build First
When converting this schema into code:
1. define shared TypeScript enum/type mirrors
2. define SQL migrations
3. define repository/query helpers
4. define service-layer validation for workspace integrity
5. define test fixtures and seed data

## 12.2 What Not to Do
AI coding agents must not:
- collapse agent and agent_version into one table
- store provider secrets directly in general config JSON if avoidable
- skip webhook receipts
- skip jobs table if using DB-backed queueing
- depend only on messages table for all reporting/audit needs
- infer current workspace from frontend input alone without validation

## 12.3 Safe Simplifications
AI coding agents may simplify by:
- using text for some event type fields at first
- using constrained JSON schemas rather than many tiny tables for first-release rules
- delaying materialized views until reporting actually needs them

---

# 13. Auto-Provisioning (Migration 004)

## 13.1 Trigger: `on_auth_user_created`
Fires after each new row in `auth.users`. Calls `handle_new_user()` which:
1. Inserts a mirror row into `public.users`
2. Creates a default workspace named `"{name}'s Workspace"`
3. Adds the user as `owner` in `workspace_users`

The slug is derived from the email prefix plus a random UUID suffix for uniqueness.

## 13.2 App-Layer Guarantee
The `ensureWorkspace()` function (`src/lib/auth/ensure-workspace.ts`) runs on every authenticated page load via `BaseLayout.astro`. It checks whether the user already has a workspace membership and creates one if missing. This covers:
- Users who existed before migration 004
- Edge cases where the DB trigger may not have fired (e.g., manual user creation)

---

# 14. Summary
This schema is designed to support a multi-workspace, integration-heavy, AI-assisted SMS conversation platform with clean history, reliable async processing, and durable reporting inputs.

The most important schema decisions are:
- workspace-scoped records
- explicit agent version history
- append-only operational event tables
- dedicated webhook/job/audit tables
- structured AI decision storage
- normalized integration boundaries

This document should be followed by:
1. `conversation-state-machine.md`
2. `integration-adapters.md`
3. `api-contracts.md`
4. `implementation-backlog.md`
