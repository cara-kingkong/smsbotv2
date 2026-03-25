# Multi-Workspace SMS Chatbot App

## Purpose of This Document
This document is written to be usable by both humans and AI coding agents.

It is intentionally:
- explicit
- structured
- low-ambiguity
- implementation-oriented
- clear about assumptions and non-goals

Use this as the source document for:
- planning
- database design
- task breakdown
- code generation
- integration implementation
- test planning

---

# 1. Product Summary

## 1.1 One-Sentence Summary
Build a multi-workspace web application that lets businesses and agencies manage AI-powered SMS chatbot campaigns that qualify leads, converse over SMS, decide whether a lead should book, route booking to the correct calendar, and send key outcomes back to the connected CRM.

## 1.2 Primary Use Case
A workspace receives lead data via webhook. A campaign is selected. One agent variant is assigned to the conversation for split testing. The agent uses AI guidance rules to converse by SMS, qualify the lead, optionally book them into the correct calendar, and report outcomes back to the CRM.

## 1.3 Initial Technology Stack
- Frontend/admin app: Astro JS
- Database/auth/realtime: Supabase
- SMS provider: Twilio
- Booking provider: Calendly
- AI provider: OpenAI first, Anthropic optional/next
- First CRM integration: Keap / Infusionsoft
- Runtime: serverless-compatible backend functions

## 1.4 Future Direction
The first version is an internal tool that should be structured so it can later become a SaaS product with self-serve signup, billing, more integrations, and more granular roles.

---

# 2. Core Product Concepts

## 2.1 Workspace
A workspace represents a business or business unit.

A workspace contains:
- users
- campaigns
- integrations
- conversations
- leads
- dashboards and reporting

A user may belong to multiple workspaces.

## 2.2 Campaign
A campaign defines a lead handling context.

A campaign contains:
- campaign-level rules
- business-hours rules
- default stop conditions
- one or more agents

A campaign belongs to exactly one workspace.

## 2.3 Agent
An agent is a versioned AI configuration assigned to a campaign.

An agent is not a fully autonomous system process.
An agent is a prompt/config variant used for split testing and conversation behavior.

An agent defines:
- base guidance prompt
- rules
- tone
- allowed actions
- AI provider selection
- assigned calendars
- message cadence settings
- qualification logic instructions

A campaign may have multiple agents.
One conversation is assigned to exactly one agent for its full lifetime.

## 2.4 Integration
An integration belongs to a workspace.

Examples:
- Twilio integration
- Keap integration
- Calendly integration
- OpenAI integration
- Anthropic integration

A workspace may connect to different CRM and calendar systems over time.
The system must not hardcode one CRM/calendar into the core domain model.

## 2.5 Lead
A lead is the external contact the system is messaging.

A lead may arrive from:
- a CRM
- a form workflow
- a generic webhook
- future direct/manual creation

For MVP, new conversations should be startable via a generic webhook.

## 2.6 Conversation
A conversation is the operational unit for SMS interaction with a lead.

A conversation:
- belongs to one workspace
- belongs to one campaign
- is assigned to one agent
- contains many messages
- may result in qualification and/or booking
- may be paused or taken over by a human
- may emit CRM outcome events

## 2.7 Calendar
Calendars are bookable scheduling targets.

Calendars are linked via workspace integrations and assigned to agents.
AI should be able to determine:
- whether booking should happen
- which calendar is correct
- whether the lead meets criteria for that calendar

## 2.8 CRM Outcome Event
A CRM outcome event is an action the system sends back to the CRM.

Examples:
- apply tag
- create note
- future: update field
- future: create task

For MVP, Keap outcome sync should at minimum support:
- apply tag
- create note

---

# 3. Product Goals

## 3.1 MVP Goals
The MVP must allow:
1. multiple workspaces
2. users belonging to multiple workspaces
3. campaign configuration
4. multiple agents per campaign for split testing
5. webhook-based conversation starting
6. Twilio send/receive SMS
7. AI-guided reply generation
8. human review/intervention in a conversation inbox
9. Calendly booking support
10. Keap outcome sync
11. dashboard metrics for statuses and outcomes

## 3.2 Non-Goals for MVP
The MVP does not need:
- billing
- self-serve signup
- number provisioning inside app
- white labelling
- many CRM integrations
- many calendar integrations
- advanced permissions beyond practical MVP needs

## 3.3 Product Quality Goals
The system should be:
- easy to extend
- safe to retry
- auditable
- integration-friendly
- suitable for AI-assisted development

---

# 4. Explicit Functional Requirements

## 4.1 Workspace and Users

### Requirements
- The system must support multiple workspaces.
- A user must be able to belong to multiple workspaces.
- A workspace must own campaigns, integrations, leads, conversations, and reporting data.
- The system should support future roles: owner, admin, manager, read-only.
- MVP may initially treat owner/admin as equivalent and keep permissions simple.

### AI Build Notes
- Workspace scoping must exist in both database structure and service logic.
- Never rely only on frontend filtering for workspace separation.

## 4.2 Campaigns

### Requirements
- A campaign belongs to one workspace.
- A campaign must support multiple agents.
- Campaign-level configuration must include business hours and stop conditions.
- Campaign must be selectable or resolvable when a webhook starts a conversation.

### AI Build Notes
- Campaign rules should be separate from agent rules.
- Campaign should act as the umbrella experiment and reporting unit.

## 4.3 Agents

### Requirements
- An agent belongs to a campaign.
- Each agent must have a weight for split-test assignment.
- Each agent must support versioned prompt/config history.
- Each conversation must persist which agent and agent version were used.
- An agent may have one or more calendars assigned.
- An agent may specify which AI provider it uses.

### AI Build Notes
- Never store only the current prompt on the agent if reporting depends on historical prompt variants.
- The conversation record must persist the chosen agent version, not just agent ID.

## 4.4 Integrations

### Requirements
- Integrations belong to a workspace.
- Integration types must support at least CRM, calendar, SMS, and AI provider.
- Workspace integrations should be configurable independently.
- Different workspaces may use different providers later.

### AI Build Notes
- Create provider adapter interfaces from the start.
- Do not let provider-specific SDK logic spread across the codebase.

## 4.5 Starting Conversations

### Requirements
- A conversation must be able to start via generic webhook.
- The webhook payload should include enough information to identify workspace and campaign and create/resolve a lead.
- A conversation start should be idempotent.
- The system must prevent duplicate conversation creation from repeated webhooks.
- A lead should not be active in multiple conflicting conversations at the same time unless explicitly allowed later.

### AI Build Notes
- Add idempotency keys.
- Persist raw inbound payloads.
- Design the webhook format so other CRMs can easily map into it.

## 4.6 Messaging

### Requirements
- Outbound SMS must send through Twilio.
- Inbound SMS from Twilio must attach to the correct conversation.
- Message history must be stored.
- Delivery state should be tracked where practical.
- Opt-out conditions must be handled.
- Business-hours rules must be respected for outbound sends.

### AI Build Notes
- Message sending should be queue-backed.
- Never assume outbound send succeeded until provider response is stored.
- Preserve raw provider message IDs for troubleshooting.

## 4.7 AI Guidance and Reply Generation

### Requirements
- AI should use guidance prompts to steer the conversation.
- AI should help determine qualification and next-step behavior.
- AI should be able to recommend whether booking should happen.
- AI should help determine which calendar is appropriate.
- AI-generated decisions should be logged in a machine-readable form where possible.

### AI Build Notes
- Prefer structured AI outputs for decisions.
- Separate "reply text" from "decision object".
- The system must be able to explain why a booking decision happened.

## 4.8 Calendars and Booking

### Requirements
- Calendly is the first supported booking provider.
- Agents may have access to multiple calendars.
- The system must support calendar eligibility criteria.
- AI may recommend a calendar, but rule-based validation should confirm eligibility where possible.
- The system must support not booking when criteria are not met.

### AI Build Notes
- Use a hybrid model: AI recommendation + deterministic validation.
- Calendar assignment should not depend purely on free-text reasoning.

## 4.9 CRM Integration

### Requirements
- Keap is the first CRM integration.
- The first CRM-trigger path for conversation creation does not need to be native CRM-triggered; a generic webhook is enough.
- The system must send conversation outcomes back to CRM.
- For MVP, CRM outcome sync must include at least:
  - apply tag to contact
  - create note on contact

### AI Build Notes
- Create generic CRM outcome event types even if only Keap uses them initially.
- Avoid naming core domain fields after Keap-specific terminology unless unavoidable.

## 4.10 Human Inbox and Intervention

### Requirements
- Users must be able to view conversation transcripts.
- Users must be able to filter/sort conversations.
- Users must be able to interject manually.
- Users must be able to take over a conversation.
- Human intervention must pause or override AI behavior.

### AI Build Notes
- Human control state should be explicit on the conversation.
- Manual actions must be audit logged.

## 4.11 Dashboard and Reporting

### Requirements
- Dashboard must show conversation statuses and outcomes.
- Reporting must work at workspace, campaign, and agent levels.
- Split testing requires comparison between agents.
- Reporting should include counts and conversion rates.

### Recommended MVP Metrics
- conversations started
- active conversations
- booked conversations
- qualified not booked
- unqualified
- no response
- opt-out rate
- human takeover rate
- time to first response
- booking rate by campaign
- booking rate by agent

### AI Build Notes
- Event capture quality matters more than chart polish in MVP.
- Store source-of-truth events needed for later aggregations.

---

# 5. Explicit Non-Functional Requirements

## 5.1 Architecture Requirements
- Provider integrations must use adapter boundaries.
- Core domain logic must be provider-agnostic where possible.
- Queueing is required from the beginning.
- The app must support async workflows and retries.

## 5.2 Reliability Requirements
- Inbound webhooks must be idempotent.
- Outbound actions must be retryable.
- Failed jobs must be observable.
- Dead-letter handling must exist.

## 5.3 Auditability Requirements
- Raw webhook payloads should be stored.
- Provider requests/responses should be logged where useful.
- Key state changes should be evented.
- Human manual actions should be logged.

## 5.4 AI-Agent-Friendly Requirements
This project documentation and codebase should be optimized for AI coding agents by following these rules:
- clear domain naming
- explicit contracts/interfaces
- small services with obvious responsibilities
- central type definitions
- schema-first thinking
- minimal hidden coupling
- low reliance on "magic" behavior
- strong use of enums and explicit state models

---

# 6. Core Business Rules

1. A user can belong to multiple workspaces.
2. A workspace owns campaigns, integrations, leads, and conversations.
3. A campaign belongs to exactly one workspace.
4. An agent belongs to exactly one campaign.
5. A campaign can have multiple agents.
6. One conversation is assigned to one agent for its full lifetime.
7. One conversation should persist the exact agent version used.
8. A lead should not have conflicting simultaneous active conversations by default.
9. Outbound messaging must respect business-hours rules.
10. Human takeover must pause AI.
11. Provider actions must be logged.
12. CRM outcome sync must be retryable.
13. Reporting must be derived from persisted states/events, not UI assumptions.

---

# 7. Recommended Domain Model

This is not final SQL. It is the intended domain structure.

## 7.1 Workspace
Fields:
- id
- name
- slug
- status
- created_at
- updated_at
- deleted_at

## 7.2 User
Fields:
- id
- email
- full_name
- auth_provider
- created_at

## 7.3 WorkspaceUser
Fields:
- id
- workspace_id
- user_id
- role
- created_at

## 7.4 Integration
Fields:
- id
- workspace_id
- type
- provider
- name
- status
- config_json
- created_at
- updated_at

## 7.5 Campaign
Fields:
- id
- workspace_id
- name
- status
- business_hours_json
- stop_conditions_json
- created_at
- updated_at
- deleted_at

## 7.6 Agent
Fields:
- id
- campaign_id
- name
- status
- ai_provider_integration_id
- weight
- created_at
- updated_at
- deleted_at

## 7.7 AgentVersion
Fields:
- id
- agent_id
- version_number
- prompt_text
- system_rules_json
- reply_cadence_json
- config_json
- is_active
- created_at

## 7.8 Calendar
Fields:
- id
- workspace_id
- integration_id
- name
- booking_url
- eligibility_rules_json
- status
- created_at

## 7.9 AgentCalendar
Fields:
- id
- agent_id
- calendar_id

## 7.10 Lead
Fields:
- id
- workspace_id
- external_contact_id
- crm_provider
- first_name
- last_name
- email
- phone_e164
- timezone
- status
- opted_out
- source_json
- created_at
- updated_at

## 7.11 Conversation
Fields:
- id
- workspace_id
- campaign_id
- agent_id
- agent_version_id
- lead_id
- status
- outcome
- needs_human
- human_controlled
- opened_at
- last_activity_at
- paused_until
- closed_at
- deleted_at

## 7.12 Message
Fields:
- id
- conversation_id
- direction
- sender_type
- body_text
- provider_message_id
- provider_status
- error_json
- sent_at
- received_at
- created_at

## 7.13 ConversationEvent
Fields:
- id
- conversation_id
- event_type
- event_payload_json
- created_at

## 7.14 CRMEvent
Fields:
- id
- workspace_id
- conversation_id
- integration_id
- event_type
- status
- request_payload_json
- response_payload_json
- retry_count
- created_at

## 7.15 WebhookReceipt
Fields:
- id
- workspace_id
- source_type
- source_identifier
- idempotency_key
- payload_json
- processed_status
- created_at

## 7.16 Job
Fields:
- id
- job_type
- queue_name
- status
- payload_json
- attempts
- max_attempts
- run_at
- last_error
- dead_lettered_at
- created_at

## 7.17 ActivityLog
Fields:
- id
- workspace_id
- user_id
- entity_type
- entity_id
- action_type
- metadata_json
- created_at

---

# 8. State Models

## 8.1 Conversation Status Enum
Recommended values:
- queued
- active
- waiting_for_lead
- paused_business_hours
- paused_manual
- needs_human
- human_controlled
- completed
- opted_out
- failed

## 8.2 Conversation Outcome Enum
Recommended values:
- booked
- qualified_not_booked
- unqualified
- no_response
- opted_out
- human_takeover
- other

## 8.3 Message Direction Enum
Recommended values:
- inbound
- outbound

## 8.4 Message Sender Type Enum
Recommended values:
- lead
- ai
- human
- system

## 8.5 Integration Type Enum
Recommended values:
- crm
- calendar
- sms
- ai_provider

## 8.6 Integration Provider Enum
Initial values:
- twilio
- calendly
- keap
- openai
- anthropic

---

# 9. External Interface Contracts

## 9.1 Generic Start Conversation Webhook
Purpose:
Allow any upstream system to trigger a conversation start without tightly coupling the system to one CRM.

### Input Shape (conceptual)
- workspace identifier
- campaign identifier
- lead fields
- source metadata
- optional idempotency key
- optional custom attributes

### Minimum Required Lead Fields
- phone number
- name or fallback label

### Suggested Optional Fields
- email
- timezone
- external contact ID
- tags
- source campaign reference
- custom field payload

### AI Build Notes
- Validate input strictly.
- Normalize phone numbers to E.164.
- Resolve workspace and campaign before side effects.

## 9.2 Inbound SMS Webhook
Purpose:
Receive replies from Twilio and append them to the right conversation.

### Requirements
- validate webhook signature
- resolve conversation by phone/thread logic
- store raw webhook payload
- append inbound message
- queue AI evaluation job

## 9.3 CRM Outcome Event Contract
Purpose:
Create a normalized internal representation for outbound CRM updates.

### Initial Internal Outcome Event Types
- conversation_booked
- conversation_qualified
- conversation_unqualified
- conversation_opted_out
- conversation_needs_human

### Keap Mapping Examples
- conversation_booked -> apply booking tag + create note
- conversation_qualified -> apply qualified tag or create note

---

# 10. AI Decision Model

This section should shape how AI logic is implemented.

## 10.1 Principle
AI should not return only text.
AI should return:
1. a proposed reply message
2. a structured decision object

## 10.2 Structured Decision Object (conceptual)
Should include:
- should_reply: boolean
- reply_text: string
- qualification_state: enum
- should_book: boolean
- recommended_calendar_id: nullable string
- escalate_to_human: boolean
- tags_to_emit: string[]
- confidence_notes: string[]
- reason_summary: string

## 10.3 Why This Matters
This makes the system more reliable for:
- auditability
- reporting
- deterministic follow-up actions
- debugging
- safe agent coding

## 10.4 Booking Logic Principle
Use AI to interpret context, but validate actions with deterministic logic before executing side effects.

Example:
- AI recommends Calendar A
- system validates that Calendar A is assigned to agent and eligibility rules match
- only then does booking flow proceed

---

# 11. Recommended Service Boundaries

## 11.1 Workspace Service
Responsibilities:
- workspace CRUD
- workspace membership validation
- workspace scoping helpers

## 11.2 Campaign Service
Responsibilities:
- campaign CRUD
- campaign configuration validation
- campaign resolution from webhook input

## 11.3 Agent Service
Responsibilities:
- agent CRUD
- agent weighting
- agent versioning
- active version resolution

## 11.4 Conversation Service
Responsibilities:
- create conversation
- resolve current active conversation for lead
- change status/outcome
- human takeover state

## 11.5 Messaging Service
Responsibilities:
- queue/send outbound SMS
- receive inbound SMS
- map Twilio statuses
- opt-out handling

## 11.6 AI Service
Responsibilities:
- call AI adapter
- build prompt input
- parse structured output
- validate decision object shape

## 11.7 Booking Service
Responsibilities:
- resolve eligible calendars
- validate booking recommendation
- execute Calendly flow
- emit booking events

## 11.8 CRM Service
Responsibilities:
- map internal outcome events to CRM adapter actions
- retry failed CRM events
- log requests/responses

## 11.9 Reporting Service
Responsibilities:
- derive metrics from source tables/events
- return workspace/campaign/agent summary views

## 11.10 Queue Service
Responsibilities:
- enqueue jobs
- run jobs
- retry jobs
- dead-letter jobs

---

# 12. Suggested Build Order

## Phase 1: Foundation
Deliver:
- repo setup
- auth setup
- workspace model
- workspace membership model
- integration adapter interfaces
- basic admin shell

## Phase 2: Campaigns and Agents
Deliver:
- campaign CRUD
- agent CRUD
- agent versioning
- weighted selection utility

## Phase 3: Conversations and Messaging
Deliver:
- generic start webhook
- lead upsert/resolve
- conversation create flow
- Twilio outbound/inbound
- message persistence
- queue-backed send flow

## Phase 4: AI Loop
Deliver:
- prompt assembly
- structured AI output parser
- AI reply flow
- qualification state updates
- conversation events

## Phase 5: Human Inbox
Deliver:
- conversation list
- transcript view
- manual reply
- takeover/pause flow

## Phase 6: Booking and CRM Sync
Deliver:
- Calendly integration
- calendar assignment logic
- booking event flow
- Keap tag/note sync

## Phase 7: Reporting and Hardening
Deliver:
- status/outcome metrics
- split-test metrics
- retry tooling
- dead-letter handling
- audit visibility

---

# 13. Constraints and Assumptions

## Constraints
- The first version should optimize for building velocity.
- The design should still preserve long-term extensibility.
- The system begins with Twilio, Calendly, and Keap only.

## Assumptions
- Workspaces may use different providers in future.
- Twilio numbers may initially be platform-owned.
- Generic webhook start is acceptable for MVP.
- Human review is available where AI is uncertain.

---

# 14. Guidance for AI Coding Agents

## 14.1 Coding Style Goals
AI coding agents working on this project should:
- prefer explicit type definitions
- avoid clever abstractions too early
- keep services small and single-purpose
- centralize enums and shared contracts
- avoid leaking provider-specific code into shared logic
- preserve audit data
- add comments only where they clarify non-obvious rules

## 14.2 Safe Assumptions
AI coding agents may assume:
- multi-workspace scoping is always required
- agent version persistence is required
- queue-backed messaging is required
- structured AI decision output is preferred over plain text

## 14.3 Unsafe Assumptions
AI coding agents must not assume:
- one user belongs to only one workspace
- only one CRM will ever exist
- only one calendar system will ever exist
- current prompt text alone is enough for reporting
- direct synchronous processing is good enough for all workflows

## 14.4 Preferred Artifact Order for Implementation
AI coding agents should implement in this order:
1. shared types and enums
2. database schema
3. service interfaces
4. provider adapters
5. core conversation orchestration
6. UI screens
7. reporting queries/views

---

# 15. Recommended Next Documents
Create these next, in order:
1. `database-schema.md`
2. `conversation-state-machine.md`
3. `integration-adapters.md`
4. `api-contracts.md`
5. `implementation-backlog.md`

---

# 16. Decision Log

## Confirmed Decisions
- Multi-workspace is required.
- Users may belong to multiple workspaces.
- Campaigns contain multiple agents for split testing.
- Agents are versioned prompt/config units.
- Conversations start via generic webhook for MVP.
- Twilio is the first SMS provider.
- Calendly is the first booking provider.
- Keap is the first CRM integration.
- CRM outcome sync is required.
- Human takeover/interjection is required.
- Dashboard/reporting is required.
- The app should be structured for future SaaS use.

## Open Decisions
- exact permission behavior for owner/admin/manager/read-only
- whether OpenAI and Anthropic are both first-release options or OpenAI-only initially
- exact queue implementation details
- exact booking execution flow with Calendly
- exact CRM event mapping vocabulary

---

# 17. Summary for Human Readers
This product is a multi-workspace operational platform for AI-guided SMS lead handling. The most important implementation priorities are clean domain boundaries, reliable async messaging, explicit conversation state, agent versioning, and normalized integration adapters.

# 18. Summary for AI Coding Agents
Build this as a domain-driven, adapter-based system with explicit enums, structured AI outputs, idempotent webhooks, queue-backed side effects, and durable event logging. Preserve workspace boundaries and versioned agent behavior at all times.

