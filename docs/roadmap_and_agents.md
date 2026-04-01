# Multi-Workspace SMS Chatbot App

## Product Roadmap

### 1. Product Summary
Build a multi-workspace SaaS-style platform for agencies and businesses to manage AI-guided SMS chatbot campaigns.

Core stack:
- Astro JS for admin UI
- Supabase for auth, database, and realtime
- Netlify Functions / Background Functions for server-side workflows
- Twilio for SMS delivery and inbound messaging
- Calendly for booking
- OpenAI and Anthropic as AI providers
- Keap/Infusionsoft as the first CRM integration

Primary use case:
- A workspace represents a business or business unit
- A workspace contains campaigns, integrations, users, and conversations
- Campaigns manage SMS nurture/qualification flows
- Campaigns can assign multiple agents for prompt/config split testing
- Conversations are triggered via inbound webhook payloads
- AI qualifies leads, decides whether to book, chooses a calendar, applies outcomes, and escalates to humans when needed

Design principle:
- Optimize for speed to MVP with clean architecture that can grow into a real SaaS later

---

### 2. MVP Goals
The MVP should support:
- Multi-workspace architecture
- Workspace users
- Campaign creation and configuration
- Agent configuration with prompt/versioning
- Weighted split testing between agents
- Conversation creation from inbound webhook
- Twilio send/receive SMS
- Calendly booking support
- Keap outcome sync (starting with booked tag and notes)
- Human inbox with intervention/takeover
- Dashboard and reporting
- Queueing and delayed sends
- Business-hours-aware messaging by lead timezone
- Audit logging and retry/dead-letter handling

---

### 3. Suggested Delivery Phases

#### Phase 0 — Foundation / Architecture
Goal: set up the platform correctly before feature work accelerates.

Deliverables:
- Monorepo or clean single-repo project structure
- Astro admin app scaffold
- Supabase project setup
- Netlify deployment pipeline
- Environment variable strategy
- Shared TypeScript domain models
- Integration adapter interfaces
- Queue/event design
- Basic auth with Google sign-in
- Workspace-aware permissions middleware

Key decisions:
- Use a service layer between UI and providers
- Keep CRM, calendar, SMS, and AI behind adapter interfaces
- Store all provider events and webhook payloads for auditability
- Make CRM the source of truth for lead/customer data

Exit criteria:
- A developer can create a workspace, log in, and hit secured workspace-scoped endpoints

#### Phase 1 — Core Messaging MVP
Goal: make the first end-to-end automated SMS conversation work.

Deliverables:
- Workspace model
- Campaign model
- Agent model
- Prompt/config versioning
- Webhook endpoint to create/start conversations
- Conversation and message persistence
- Twilio outbound and inbound messaging
- Queue for delayed sends and retries
- Business hours logic using lead timezone
- Stop conditions and opt-out handling
- AI reply generation using one provider first
- Human intervention flagging
- Basic inbox to view and reply manually

Exit criteria:
- A lead can be posted to a webhook and receive AI-guided SMS replies
- A human can step in, pause AI, reply manually, and hand back to AI

#### Phase 2 — Qualification, Booking, and CRM Outcome Sync
Goal: make conversations useful for sales workflows.

Deliverables:
- Calendly integration
- Calendar entities at workspace/integration level
- Agent-to-calendar assignment
- Calendar eligibility criteria support
- Booking orchestration rules
- Keap integration
- Apply booked tag in Keap
- Create contact notes in Keap
- Unified outcome events model
- Conversation outcome statuses

Exit criteria:
- AI can decide whether a lead qualifies, choose a calendar, and trigger booking flow
- Successful booking results in CRM update

#### Phase 3 — Split Testing and Reporting
Goal: optimize campaigns and compare performance.

Deliverables:
- Weighted random agent assignment
- Agent stickiness for conversation lifetime
- Provider-per-agent selection
- Dashboard metrics by workspace, campaign, and agent
- A/B comparison views inside campaign
- Realtime summaries
- Funnel reporting
- Speed-to-first-response metric
- Human takeover and opt-out rates

Exit criteria:
- Users can compare agent versions and prompts against booking outcomes

#### Phase 4 — Integration Hardening and Operational Controls
Goal: make the system reliable enough for broader use.

Deliverables:
- Integration health checks
- Retry queues and dead-letter queue UI/admin visibility
- Webhook replay tools
- Activity log for user actions
- Soft deletion support
- Guardrails / workspace-level policy blocks
- Admin logs for Twilio delivery failures
- Better inbox filters and statuses

Exit criteria:
- Failures are observable and recoverable without database surgery

#### Phase 5 — SaaS Readiness
Goal: prepare for external customers later.

Deliverables:
- Self-serve workspace provisioning
- Billing/event model placeholders
- Subscription-aware feature flags
- Twilio Connect integration — replace manual credential entry with OAuth-style "Connect with Twilio" button so workspace owners can authorize their Twilio account without copy/pasting API keys. Billing stays on the customer's Twilio account. Uses Twilio's Connect Apps API to receive a sandboxed subaccount SID per workspace.
- More granular RBAC
- CRM adapter expansion
- Calendar provider expansion
- Number provisioning workflow
- Onboarding wizard for non-technical users

Exit criteria:
- Platform can begin transitioning from internal tool to external SaaS

---

### 4. Recommended MVP Scope Cut

#### Must Have
- Multi-workspace
- Single admin-style user role initially
- Campaigns
- Agents
- Agent versioning
- Weighted split testing
- Twilio SMS send/receive
- Webhook-triggered conversation creation
- Human inbox
- Calendly integration
- Keap outcome sync
- Dashboard basics
- Queueing
- Business hours / lead timezone logic
- Retry + dead-letter handling

#### Nice to Have Soon After
- Multiple AI providers per workspace
- A/B comparison reports with stronger visualization
- Better inbox views and saved filters
- Workspace guardrails editor
- Manual lead creation UX polish

#### Later
- Billing
- Self-serve signup
- Twilio Connect OAuth flow (replace manual API key entry with "Connect with Twilio" button)
- More CRM integrations
- More calendar systems
- More granular permissions
- Number provisioning inside app
- Wizard-based campaign builder

---

### 5. Architecture Outline

#### Frontend
Astro admin app with workspace-scoped dashboard pages.

Main UI areas:
- Workspace selector
- Campaigns
- Agents
- Integrations
- Conversations / inbox
- Dashboard / reporting
- Settings

#### Backend
Use Netlify Functions / Background Functions for orchestration.

Suggested backend domains:
- auth
- workspaces
- campaigns
- agents
- conversations
- messaging
- ai
- scheduling
- crm
- integrations
- reporting
- queues
- audit

#### Data Layer
Supabase Postgres + realtime.

Suggested principles:
- Keep raw provider payloads in append-only log tables
- Keep read-optimized reporting tables/materialized views later
- Use soft deletes for core records
- Use event records for important state changes

#### Async / Queueing
You will need queueing from day one.

Likely jobs:
- send scheduled SMS
- generate AI reply
- retry failed provider action
- post CRM outcome event
- sync booking result
- enforce delayed cadence
- replay dead-letter jobs

---

### 6. Suggested Domain Model

#### Workspace
- id
- name
- slug
- status
- created_at
- deleted_at

#### User
- id
- email
- name
- auth_provider

#### WorkspaceUser
- id
- workspace_id
- user_id
- role

#### Integration
- id
- workspace_id
- type (crm, calendar, ai_provider)
- provider (keap, calendly, openai, anthropic)
- status
- config_json
- created_at

#### Campaign
- id
- workspace_id
- name
- status
- business_hours_json
- default_stop_conditions_json
- created_at
- deleted_at

#### Agent
- id
- campaign_id
- name
- status
- ai_provider_integration_id
- weight
- created_at
- deleted_at

#### AgentVersion
- id
- agent_id
- version_number
- prompt
- tone_rules
- allowed_actions_json
- reply_cadence_json
- config_json
- is_active
- created_at

#### Calendar
- id
- workspace_id
- integration_id
- title
- eligibility_rules_text
- booking_link
- status

#### AgentCalendar
- id
- agent_id
- calendar_id

#### Lead
- id
- workspace_id
- external_contact_id
- crm_source
- name
- phone
- email
- timezone
- opted_out
- raw_profile_json

#### Conversation
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
- started_at
- last_message_at
- paused_until
- deleted_at

#### Message
- id
- conversation_id
- direction (inbound, outbound)
- sender_type (ai, human, system, lead)
- body
- provider_message_id
- delivery_status
- sent_at
- received_at
- error_json

#### ConversationEvent
- id
- conversation_id
- type
- payload_json
- created_at

#### CRMEvent
- id
- workspace_id
- conversation_id
- integration_id
- type
- status
- request_payload_json
- response_payload_json
- created_at

#### Job
- id
- type
- status
- queue_name
- payload_json
- attempts
- run_at
- last_error
- dead_lettered_at

#### ActivityLog
- id
- workspace_id
- user_id
- entity_type
- entity_id
- action
- metadata_json
- created_at

---

### 7. Statuses and Outcomes

#### Conversation Statuses
- queued
- active
- waiting_for_lead
- paused_business_hours
- needs_human
- human_controlled
- completed
- opted_out
- failed

#### Conversation Outcomes
- booked
- qualified_not_booked
- unqualified
- no_response
- opted_out
- human_takeover

---

### 8. Critical Product Rules

1. A user can belong to multiple workspaces.
2. One lead should not be active in multiple campaigns at once.
3. Repeat leads should rejoin the existing thread/history where appropriate.
4. Agent assignment should be weighted random at conversation start.
5. The assigned agent stays attached for the life of the conversation.
6. Business hours are determined by the lead timezone.
7. If outside business hours, outbound messages should queue rather than send.
8. Human intervention automatically pauses AI.
9. Human can send one-off replies or take permanent control.
10. AI providers, CRM providers, and calendar providers must all be abstracted behind adapters.
11. CRM remains the source of truth when data conflicts exist.
12. All provider interactions should be logged for audit and retry.

---

### 9. Implementation Sequence

#### Sprint 1
- Repo setup
- Supabase schema baseline
- Astro auth and workspace shell
- Basic workspace CRUD
- Basic campaign CRUD

#### Sprint 2
- Agent CRUD
- Agent versioning
- Webhook to start conversation
- Conversation and message persistence

#### Sprint 3
- Twilio outbound/inbound
- AI generation loop
- Queue + delayed send support
- Business hours logic

#### Sprint 4
- Human inbox
- Manual replies
- Needs-attention flow
- Conversation filters

#### Sprint 5
- Calendly integration
- Booking decision flow
- Outcome state handling

#### Sprint 6
- Keap adapter
- Apply booked tag
- Write note to contact
- CRM event logging

#### Sprint 7
- Split testing
- Metrics pipeline
- Dashboard and A/B comparison

#### Sprint 8
- Hardening
- Retry/dead-letter workflows
- Activity logs
- Guardrails

---

### 10. Biggest Risks to Manage Early
- Queue/orchestration complexity in serverless environment
- Keeping conversation state consistent across async jobs
- Preventing duplicate sends and duplicate conversation starts
- Designing prompt freedom without producing unsafe or off-brand replies
- Booking logic getting too magical too early
- CRM adapter assumptions leaking into core application logic
- Reporting becoming hard because events are not captured cleanly from the start

Mitigation:
- Use event-driven state changes
- Introduce idempotency keys on webhooks and send jobs
- Keep decision logging for AI outputs
- Start with one CRM and one calendar integration but keep interfaces generic

---

## AGENTS.md

```md
# AGENTS.md

## Project Overview
This project is a multi-workspace SMS chatbot platform for agencies and businesses.

The system allows a workspace to configure campaigns that use AI-powered SMS agents to qualify leads, reply by SMS, decide whether a lead should book, choose an appropriate calendar, and push key outcomes back into a CRM.

Primary stack:
- Astro JS
- Supabase
- Netlify Functions / Background Functions
- Twilio
- Calendly
- OpenAI and Anthropic
- Keap/Infusionsoft

This project is being built for fast MVP delivery, but the architecture should stay clean enough to grow into a SaaS platform.

---

## Core Product Model
- A workspace has users, campaigns, integrations, and conversations.
- A campaign belongs to one workspace.
- A campaign has multiple agents.
- An agent represents a prompt/config variant for split testing.
- Agents can be assigned one or more calendars.
- Integrations are installed at workspace level.
- A conversation starts from an inbound webhook or manual creation.
- A lead should not be active in multiple campaigns at once.
- A conversation remains tied to the agent assigned at the start.

---

## Engineering Principles

### 1. Build for MVP speed, but avoid dead-end architecture
Choose the simplest implementation that still preserves clean boundaries between domains.

### 2. Keep provider logic behind adapters
All Twilio, Keap, Calendly, OpenAI, and Anthropic interactions must live behind provider-specific adapters and shared interfaces.

### 3. Keep business logic out of UI components
Astro pages/components should orchestrate input and rendering only. Domain logic belongs in services.

### 4. Prefer explicit state transitions
Conversation status, outcomes, retries, pauses, and human takeover should be modeled as explicit state changes, not implied behavior.

### 5. Log everything important
All webhook payloads, provider calls, delivery results, CRM actions, booking attempts, and state transitions should be logged.

### 6. Design for idempotency
Incoming webhooks, send jobs, booking actions, and CRM sync actions must be safe to retry.

### 7. CRM is source of truth for lead/customer records
The app stores operational copies needed for messaging and analytics, but if CRM data conflicts with local data, CRM wins.

### 8. Optimize for observability
Background jobs, failed sends, retries, and dead-letter states must be diagnosable without deep manual investigation.

---

## What Agents Mean In This Product
In this project, an "agent" is not a fully autonomous software worker.

An agent is a versioned configuration unit used inside a campaign for split testing. It defines:
- prompt
- tone
- allowed actions
- rules
- AI provider
- reply cadence
- assigned calendars

A conversation is assigned to one agent when it starts and keeps that agent for its lifecycle.

---

## Functional Requirements

### Workspaces
- Multi-workspace is mandatory.
- A user can belong to multiple workspaces.
- MVP may treat all users as admin-level.
- Future roles: owner, admin, manager, read-only.

### Campaigns
- Campaigns belong to a workspace.
- Campaigns represent a funnel or funnel stage.
- Campaign-level settings include business hours, stop conditions, and baseline messaging rules.

### Agents
- Agents belong to campaigns.
- Multiple agents per campaign allow weighted split testing.
- Agent prompt/config must be versioned.
- AI provider can vary per agent.

### Conversations
- Started by inbound webhook or manual creation.
- Must support Twilio inbound and outbound SMS.
- Must support human pause/takeover.
- Must respect lead timezone and business hours.
- Must stop on opt-out or pause conditions.

### Calendars
- Start with Calendly only.
- Agents can access assigned calendars.
- Calendar booking eligibility is prompt-driven and/or criteria-driven.
- If no slot is available, send booking link fallback.

### CRM
- Start with Keap.
- Triggering a conversation begins with generic webhook input, not CRM-native triggers.
- CRM outcome sync must support at least:
  - apply booked tag
  - create contact note
- CRM adapter design should anticipate more CRMs later.

### Reporting
- Workspace, campaign, and agent reporting are required.
- Metrics include:
  - conversations started
  - booking rate
  - opt-out rate
  - human takeover rate
  - speed to first response
- A/B comparison between agents is required.

---

## Non-Functional Requirements
- Queueing is required from day one.
- Retry and dead-letter handling are required from day one.
- Soft deletion is required for workspaces, campaigns, and conversations.
- Full transcript retention is allowed initially.
- Standard cloud hosting is acceptable.
- Twilio account and phone numbers are platform-owned.

---

## Suggested Code Organization

```text
/src
  /pages
  /components
  /layouts
  /lib
    /db
    /auth
    /workspaces
    /campaigns
    /agents
    /conversations
    /messaging
    /crm
    /calendar
    /ai
    /integrations
    /reporting
    /queues
    /audit
    /utils
/netlify
  /functions
  /background-functions
/supabase
  /migrations
  /seed
/docs
```

### Preferred layering
- `pages/components`: rendering and request shaping
- `lib/*`: domain services and adapters
- `netlify/functions`: transport layer / entrypoints only
- `supabase/migrations`: schema history

---

## Adapter Contracts
When adding a provider integration, define and implement shared contracts.

### AI Provider Adapter
Should support:
- generateReply()
- evaluateQualification()
- chooseCalendar()
- produceDecisionLog()

### CRM Adapter
Should support:
- upsertLeadReference()
- applyTag()
- createNote()
- emitOutcomeEvent()
- healthCheck()

### Calendar Adapter
Should support:
- listAvailableCalendars()
- createBooking()
- cancelBooking()
- rescheduleBooking()
- healthCheck()

### SMS Adapter
Should support:
- sendMessage()
- handleInboundWebhook()
- validateWebhook()
- getDeliveryStatus()

---

## Conversation Orchestration Rules
1. Receive inbound webhook or manual lead creation.
2. Resolve workspace and campaign.
3. Enforce no-active-conversation rule for the lead.
4. Assign agent by weighted random selection.
5. Create conversation and initial event log.
6. Queue first outbound message according to business hours and cadence.
7. On inbound lead reply, append message and queue AI evaluation.
8. AI decides next message, qualification state, escalation need, and booking actions.
9. If human intervenes, AI pauses immediately.
10. If conversation reaches terminal outcome, persist outcome and emit CRM events as needed.

---

## Guardrails
- Never let provider-specific logic leak directly into campaign logic.
- Never make UI the only place where validation happens.
- Never assume webhook delivery happens exactly once.
- Never assume a message send succeeded without provider confirmation.
- Never hardcode Keap-specific concepts into generic CRM domain types.
- Never mutate transcript history destructively.

---

## Development Workflow Expectations
- Use TypeScript throughout.
- Create schema migrations for database changes.
- Keep domain types centralized.
- Add structured logs for async workflows.
- Prefer small composable services over large utility files.
- Document provider assumptions near adapter implementations.
- Add seed data and fixtures where useful for local testing.

---

## Definition of Done
A feature is only considered done when:
- backend behavior works
- UI path exists where required
- logs exist for key actions
- failure states are handled
- retries are considered where appropriate
- schema changes are migrated
- the feature respects workspace scoping

---

## MVP Priority Order
1. Workspace + auth
2. Campaigns + agents
3. Conversation creation
4. Twilio messaging
5. AI reply loop
6. Queueing / business hours
7. Human inbox
8. Calendly booking
9. Keap outcome sync
10. Reporting + split testing

---

## Future Expansion Notes
Future versions may add:
- self-serve signup
- billing
- Twilio Connect OAuth flow (eliminates manual credential entry for workspace Twilio setup)
- more CRM providers
- more calendar systems
- client-friendly setup wizard
- more granular roles
- number provisioning
- deeper compliance controls
```

---

## 11. Recommended Next Build Artifacts
After this document, the next things to create should be:
1. product requirements document (PRD)
2. database schema draft
3. event/state machine spec for conversations
4. provider adapter interface spec
5. first-pass UI sitemap
6. implementation backlog by sprint

