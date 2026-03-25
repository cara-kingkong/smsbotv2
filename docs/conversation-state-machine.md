
# conversation-state-machine.md

## Purpose
This document defines the runtime lifecycle for conversations in the multi-workspace SMS chatbot platform.

It is written for:
- backend engineers
- frontend engineers
- AI coding agents
- QA engineers
- product/design validation

This document is intended to remove ambiguity around:
- valid conversation states
- valid transitions
- which actor can trigger a transition
- which guard conditions must pass
- which side effects must happen
- which events must be persisted

This document should be treated as the source of truth for conversation orchestration until replaced by a more formal workflow engine spec.

---

# 1. Design Principles

## 1.1 Core Principle
A conversation is a long-lived operational process, not just a message thread.

It has:
- a lifecycle
- explicit state
- explicit ownership
- explicit side effects
- explicit audit history

## 1.2 Why This Exists
Without an explicit state machine, the system becomes hard to reason about when:
- duplicate webhooks arrive
- humans interject
- messages are queued outside business hours
- AI decides to escalate
- booking is recommended but not allowed
- CRM updates fail and need retries

## 1.3 Modeling Rule
The `conversations` table stores current state.
The `conversation_events` table stores the history of state changes and important actions.
The `messages`, `ai_decisions`, `booking_events`, `crm_events`, and `jobs` tables store supporting operational facts.

Never rely on current state alone when history matters.

---

# 2. State Model Overview

## 2.1 Primary Conversation Status Values
The recommended conversation status enum is:

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

## 2.2 Status Meanings

### `queued`
The conversation exists, but work is waiting to be performed.
Typical reasons:
- first outbound message is queued
- inbound reply was received and AI evaluation is queued
- a follow-up send is queued
- a system action is pending before active interaction resumes

### `active`
The conversation is currently in system-controlled flow and can continue automatically.

### `waiting_for_lead`
The system has sent a message or completed its current turn and is waiting for the lead to respond.

### `paused_business_hours`
The system wants to send or act, but outbound behavior is paused because the lead is currently outside allowed business hours.

### `paused_manual`
The conversation is intentionally paused by a human, but not necessarily fully taken over.

### `needs_human`
The system believes human attention is required before it should continue.

### `human_controlled`
A human has taken over the conversation and AI must not continue automatically.

### `completed`
The conversation has reached a terminal successful or neutral end state.

### `opted_out`
The lead has opted out or otherwise triggered a durable suppression condition.

### `failed`
The conversation cannot continue because of a system failure or unrecoverable operational problem.

---

# 3. Outcome Model

## 3.1 Conversation Outcome Values
Status and outcome are different.

Recommended outcome enum:

- `booked`
- `qualified_not_booked`
- `unqualified`
- `no_response`
- `opted_out`
- `human_takeover`
- `other`

## 3.2 Status vs Outcome
Status answers: "What is happening right now?"
Outcome answers: "How did this conversation end?"

Examples:
- A conversation can have status `human_controlled` and no outcome yet.
- A conversation can have status `completed` and outcome `booked`.
- A conversation can have status `opted_out` and outcome `opted_out`.

---

# 4. Actors

## 4.1 Actors That Can Trigger Transitions
The system must treat these actors distinctly:

- `system`
- `ai`
- `lead`
- `human`
- `provider_webhook`
- `scheduler`

## 4.2 Actor Responsibilities

### `system`
Application orchestration logic, validation, service-layer transitions.

### `ai`
Structured decisions produced by the AI layer.
AI does not directly mutate database state without system validation.

### `lead`
Inbound SMS responses, opt-outs, booking confirmations, silence/no response over time.

### `human`
Manual replies, pause/resume, takeover, release, conversation closure.

### `provider_webhook`
Twilio delivery receipts, inbound SMS webhooks, booking callbacks, CRM callbacks.

### `scheduler`
Delayed follow-ups, business-hours release, stale conversation checks, no-response handling.

---

# 5. Terminal vs Non-Terminal States

## 5.1 Terminal States
A conversation is terminal if automatic flow should never resume unless explicitly reopened by a future feature.

Terminal statuses:
- `completed`
- `opted_out`
- `failed`

## 5.2 Non-Terminal States
Non-terminal statuses:
- `queued`
- `active`
- `waiting_for_lead`
- `paused_business_hours`
- `paused_manual`
- `needs_human`
- `human_controlled`

---

# 6. High-Level Lifecycle

## 6.1 Typical Happy Path
1. conversation created
2. status = `queued`
3. initial message job executes
4. status = `active`
5. outbound SMS sent
6. status = `waiting_for_lead`
7. lead replies
8. status = `queued`
9. AI evaluation runs
10. status = `active`
11. outbound reply sent
12. status = `waiting_for_lead`
13. qualification complete
14. booking recommended
15. booking created
16. CRM event queued
17. status = `completed`
18. outcome = `booked`

## 6.2 Human Escalation Path
1. conversation active
2. AI flags escalation
3. status = `needs_human`
4. human reviews
5. human takes over
6. status = `human_controlled`
7. human sends manual reply
8. human resolves and closes
9. status = `completed`
10. outcome = `human_takeover` or another final outcome

## 6.3 Business Hours Delay Path
1. system wants to send message
2. lead is outside allowed hours
3. status = `paused_business_hours`
4. delayed job scheduled
5. scheduler wakes conversation
6. status = `queued`
7. send job executes
8. status = `active`
9. message sent
10. status = `waiting_for_lead`

---

# 7. State Transition Table

## 7.1 Format
Each transition definition includes:
- from state
- to state
- trigger
- actor
- guard conditions
- required side effects
- required event(s)

---

## 7.2 Initial Creation

### Transition: create conversation
- from: none
- to: `queued`
- trigger: valid start-conversation request
- actor: `system`
- guards:
  - workspace exists
  - campaign exists and belongs to workspace
  - no conflicting active conversation for lead
  - agent successfully assigned
  - agent active version resolved
- side effects:
  - create or resolve lead
  - create conversation row
  - create initial conversation event
  - enqueue initial job
- events:
  - `conversation_started`
  - `status_changed`

---

## 7.3 Queue Processing

### Transition: queued to active
- from: `queued`
- to: `active`
- trigger: queued work begins processing
- actor: `system` or `scheduler`
- guards:
  - conversation is not terminal
  - not human controlled
  - not manually paused
  - not opted out
- side effects:
  - mark relevant job as processing
  - update timestamps
- events:
  - `status_changed`

### Transition: active to waiting_for_lead
- from: `active`
- to: `waiting_for_lead`
- trigger: outbound message successfully sent and system is now waiting
- actor: `system`
- guards:
  - outbound action succeeded
  - no follow-up action immediately pending in same transaction
- side effects:
  - persist message send success
  - update `last_activity_at`
- events:
  - `message_sent`
  - `status_changed`

### Transition: waiting_for_lead to queued
- from: `waiting_for_lead`
- to: `queued`
- trigger: inbound lead reply received
- actor: `provider_webhook`
- guards:
  - conversation is not terminal
  - lead is not opted out
  - inbound message matched to conversation
- side effects:
  - store inbound message
  - enqueue AI evaluation job
  - update `last_activity_at`
- events:
  - `message_received`
  - `status_changed`

---

## 7.4 Business Hours Control

### Transition: queued to paused_business_hours
- from: `queued`
- to: `paused_business_hours`
- trigger: attempted outbound action occurs outside allowed hours
- actor: `system`
- guards:
  - outbound action required
  - business-hours policy says do not send now
- side effects:
  - schedule wake-up job
  - persist pause reason
- events:
  - `status_changed`
  - `business_hours_pause_scheduled`

### Transition: active to paused_business_hours
- from: `active`
- to: `paused_business_hours`
- trigger: system decides next outbound action must wait for business hours
- actor: `system`
- guards:
  - outbound send not allowed now
- side effects:
  - schedule wake-up job
- events:
  - `status_changed`
  - `business_hours_pause_scheduled`

### Transition: paused_business_hours to queued
- from: `paused_business_hours`
- to: `queued`
- trigger: business-hours wake-up time reached
- actor: `scheduler`
- guards:
  - conversation is not terminal
  - not human controlled
  - still eligible to continue
- side effects:
  - enqueue pending work
- events:
  - `status_changed`
  - `business_hours_pause_released`

---

## 7.5 Manual Pause Control

### Transition: active to paused_manual
- from: `active`
- to: `paused_manual`
- trigger: user manually pauses conversation
- actor: `human`
- guards:
  - conversation is non-terminal
- side effects:
  - cancel or suppress auto-processing jobs if needed
  - record pause metadata
- events:
  - `status_changed`
  - `manual_pause_started`

### Transition: waiting_for_lead to paused_manual
- from: `waiting_for_lead`
- to: `paused_manual`
- trigger: user manually pauses conversation
- actor: `human`
- guards:
  - conversation is non-terminal
- side effects:
  - record pause metadata
- events:
  - `status_changed`
  - `manual_pause_started`

### Transition: paused_manual to queued
- from: `paused_manual`
- to: `queued`
- trigger: user resumes conversation
- actor: `human`
- guards:
  - conversation is non-terminal
  - not opted out
- side effects:
  - enqueue next appropriate job
- events:
  - `status_changed`
  - `manual_pause_released`

---

## 7.6 Human Escalation

### Transition: active to needs_human
- from: `active`
- to: `needs_human`
- trigger: AI or system escalation decision
- actor: `system`
- guards:
  - structured AI decision says escalate
  - or validation/business rule requires human review
- side effects:
  - set `needs_human = true`
  - notify users if notification system exists
- events:
  - `status_changed`
  - `human_attention_requested`

### Transition: waiting_for_lead to needs_human
- from: `waiting_for_lead`
- to: `needs_human`
- trigger: inbound reply creates ambiguity/risk requiring review
- actor: `system`
- guards:
  - AI/system determines human needed
- side effects:
  - set `needs_human = true`
- events:
  - `status_changed`
  - `human_attention_requested`

### Transition: needs_human to human_controlled
- from: `needs_human`
- to: `human_controlled`
- trigger: user takes over conversation
- actor: `human`
- guards:
  - conversation is non-terminal
- side effects:
  - set `human_controlled = true`
  - set `needs_human = false`
  - suppress auto-AI jobs
  - optionally assign user
- events:
  - `status_changed`
  - `human_takeover_started`

### Transition: active to human_controlled
- from: `active`
- to: `human_controlled`
- trigger: user directly takes over conversation
- actor: `human`
- guards:
  - conversation is non-terminal
- side effects:
  - set `human_controlled = true`
  - set `needs_human = false`
  - suppress auto-AI jobs
- events:
  - `status_changed`
  - `human_takeover_started`

### Transition: waiting_for_lead to human_controlled
- from: `waiting_for_lead`
- to: `human_controlled`
- trigger: user directly takes over conversation
- actor: `human`
- guards:
  - conversation is non-terminal
- side effects:
  - set `human_controlled = true`
  - set `needs_human = false`
- events:
  - `status_changed`
  - `human_takeover_started`

### Transition: human_controlled to queued
- from: `human_controlled`
- to: `queued`
- trigger: user releases conversation back to automation
- actor: `human`
- guards:
  - conversation is non-terminal
  - lead is not opted out
  - campaign/agent still active
- side effects:
  - set `human_controlled = false`
  - enqueue next appropriate action
- events:
  - `status_changed`
  - `human_takeover_released`

---

## 7.7 AI Execution Loop

### Transition: queued to active for AI evaluation
- from: `queued`
- to: `active`
- trigger: AI evaluation job starts
- actor: `system`
- guards:
  - conversation is not terminal
  - not human controlled
  - required transcript context available
- side effects:
  - lock job
  - gather transcript and agent version
- events:
  - `status_changed`
  - `ai_evaluation_started`

### Transition: active to queued after AI decision
- from: `active`
- to: `queued`
- trigger: AI decision produced and validated, with next side effect pending
- actor: `system`
- guards:
  - structured decision parsed successfully
  - not blocked by business rules
- side effects:
  - persist ai_decision
  - enqueue send/booking/CRM jobs as needed
- events:
  - `ai_decision_recorded`
  - `status_changed`

### Transition: active to needs_human after AI decision
- from: `active`
- to: `needs_human`
- trigger: AI decision indicates escalation and system accepts it
- actor: `system`
- guards:
  - decision object valid
  - escalation allowed/required
- side effects:
  - persist ai_decision
  - notify human
- events:
  - `ai_decision_recorded`
  - `human_attention_requested`
  - `status_changed`

### Transition: active to failed for AI execution failure
- from: `active`
- to: `failed`
- trigger: repeated unrecoverable AI processing failure
- actor: `system`
- guards:
  - retries exhausted
  - no safe recovery path
- side effects:
  - persist failure
  - alert operators if available
- events:
  - `ai_processing_failed`
  - `status_changed`

---

## 7.8 Booking Flow

### Transition: active to queued after booking recommendation
- from: `active`
- to: `queued`
- trigger: AI recommends booking and system validates enough to continue
- actor: `system`
- guards:
  - recommended calendar belongs to agent/workspace
  - eligibility rules pass
- side effects:
  - persist booking event
  - enqueue booking action or booking invitation message
- events:
  - `booking_recommended`
  - `status_changed`

### Transition: active to needs_human on booking ambiguity
- from: `active`
- to: `needs_human`
- trigger: booking desired but validation fails or ambiguity remains
- actor: `system`
- guards:
  - AI recommendation exists
  - deterministic validation rejects or cannot confirm
- side effects:
  - persist booking rejection reason
- events:
  - `booking_rejected`
  - `human_attention_requested`
  - `status_changed`

### Transition: waiting_for_lead to completed with booked outcome
- from: `waiting_for_lead`
- to: `completed`
- trigger: booking confirmed
- actor: `provider_webhook` or `system`
- guards:
  - booking confirmation mapped to conversation/lead
- side effects:
  - persist booking event
  - enqueue CRM outcome sync
  - set outcome = `booked`
  - set `closed_at`
- events:
  - `booking_created`
  - `outcome_changed`
  - `status_changed`

### Transition: active to completed with booked outcome
- from: `active`
- to: `completed`
- trigger: booking completed as immediate result of current step
- actor: `system`
- guards:
  - booking successfully confirmed
- side effects:
  - persist booking event
  - enqueue CRM outcome sync
  - set outcome = `booked`
  - set `closed_at`
- events:
  - `booking_created`
  - `outcome_changed`
  - `status_changed`

---

## 7.9 Opt-Out Flow

### Transition: any non-terminal state to opted_out
- from: any non-terminal state
- to: `opted_out`
- trigger: lead sends stop keyword or equivalent suppression signal
- actor: `provider_webhook` or `system`
- guards:
  - inbound message matches stop condition
- side effects:
  - mark lead as opted out
  - suppress future sends
  - cancel queued outbound jobs where possible
  - set outcome = `opted_out`
  - set `closed_at`
- events:
  - `lead_opted_out`
  - `outcome_changed`
  - `status_changed`

---

## 7.10 Completion Without Booking

### Transition: active to completed with qualified_not_booked
- from: `active`
- to: `completed`
- trigger: qualification achieved but no booking will occur
- actor: `system`
- guards:
  - business rules say stop here
- side effects:
  - enqueue CRM outcome sync if needed
  - set outcome = `qualified_not_booked`
  - set `closed_at`
- events:
  - `outcome_changed`
  - `status_changed`

### Transition: active to completed with unqualified
- from: `active`
- to: `completed`
- trigger: lead determined not qualified
- actor: `system`
- guards:
  - qualification logic is conclusive
- side effects:
  - enqueue CRM sync if needed
  - set outcome = `unqualified`
  - set `closed_at`
- events:
  - `outcome_changed`
  - `status_changed`

### Transition: waiting_for_lead to completed with no_response
- from: `waiting_for_lead`
- to: `completed`
- trigger: max follow-up/no-response policy reached
- actor: `scheduler`
- guards:
  - no response received within policy window
  - follow-up policy exhausted
- side effects:
  - enqueue CRM sync if needed
  - set outcome = `no_response`
  - set `closed_at`
- events:
  - `no_response_timeout_reached`
  - `outcome_changed`
  - `status_changed`

### Transition: human_controlled to completed
- from: `human_controlled`
- to: `completed`
- trigger: human closes conversation
- actor: `human`
- guards:
  - conversation is non-terminal
- side effects:
  - optionally set outcome
  - set `closed_at`
- events:
  - `status_changed`
  - `conversation_closed_by_human`

---

## 7.11 Failure Flow

### Transition: any non-terminal state to failed
- from: any non-terminal state
- to: `failed`
- trigger: unrecoverable processing failure
- actor: `system`
- guards:
  - retries exhausted
  - no safe fallback exists
- side effects:
  - persist failure reason
  - stop auto-processing
- events:
  - `conversation_failed`
  - `status_changed`

---

# 8. Guard Conditions

## 8.1 Global Guards
These checks should apply broadly before most automatic transitions:

- conversation is not terminal
- lead is not opted out
- workspace is active
- campaign is active if campaign-level automation is required
- agent is active
- agent version exists and is valid
- conversation is not currently human controlled unless the transition is human-triggered
- required integration exists and is active

## 8.2 Messaging Guards
Before sending outbound SMS:
- Twilio integration is active
- destination phone exists
- lead not opted out
- business hours allow send, or message is marked exempt
- idempotency key has not already been used for equivalent send

## 8.3 AI Guards
Before AI evaluation:
- transcript context available
- agent version exists
- AI provider integration active
- conversation is not human controlled
- current state allows AI execution

## 8.4 Booking Guards
Before booking:
- calendar exists
- calendar belongs to workspace
- calendar is assigned to agent if required
- eligibility rules pass
- booking provider integration active

## 8.5 CRM Guards
Before sending CRM event:
- CRM integration active
- required external contact reference exists, or mapping strategy exists
- event type is supported by adapter

---

# 9. Required Side Effects by Transition Type

## 9.1 On Status Change
Whenever status changes:
- update `conversations.status`
- update `conversations.last_activity_at` if appropriate
- append `conversation_events` row with old and new status
- include actor and reason metadata

## 9.2 On Outcome Change
Whenever outcome changes:
- update `conversations.outcome`
- append `conversation_events` row
- enqueue CRM event if business rules require it

## 9.3 On Human Takeover
Whenever human takeover starts:
- set `human_controlled = true`
- set `needs_human = false`
- suppress or invalidate pending auto-processing jobs if needed
- append audit log entry

## 9.4 On Human Release
Whenever automation resumes:
- set `human_controlled = false`
- append event
- enqueue appropriate next step

## 9.5 On Opt-Out
Whenever opt-out occurs:
- set lead `opted_out = true`
- set conversation status `opted_out`
- set outcome `opted_out`
- cancel future sends if possible
- record opt-out source message

---

# 10. Canonical Events

## 10.1 Required Event Types
At minimum, the system should support these event types:

- `conversation_started`
- `status_changed`
- `outcome_changed`
- `message_received`
- `message_queued`
- `message_sent`
- `message_failed`
- `ai_evaluation_started`
- `ai_decision_recorded`
- `human_attention_requested`
- `human_takeover_started`
- `human_takeover_released`
- `manual_pause_started`
- `manual_pause_released`
- `business_hours_pause_scheduled`
- `business_hours_pause_released`
- `booking_recommended`
- `booking_rejected`
- `booking_created`
- `crm_event_queued`
- `lead_opted_out`
- `conversation_failed`
- `conversation_closed_by_human`
- `no_response_timeout_reached`

## 10.2 Event Payload Guidance
Each event payload should include, where relevant:
- actor type
- actor id
- prior state
- next state
- reason code
- free-text summary
- related job id
- related message id
- related ai_decision id
- related crm_event id
- related booking_event id

---

# 11. No-Response and Timeout Rules

## 11.1 No-Response Policy
Campaign or agent policy may define:
- initial reply delay
- follow-up delay
- max follow-ups
- max silence window before completion

## 11.2 Suggested Handling
When lead has not replied:
1. scheduler checks eligible conversations in `waiting_for_lead`
2. if follow-up remains, enqueue outbound follow-up
3. if no follow-up remains, close as `completed`
4. set outcome = `no_response`

## 11.3 Important Constraint
Do not close for no-response while:
- human controlled
- manually paused
- booking callback still expected within allowed window
- pending outbound send has not been attempted

---

# 12. Duplicate and Idempotent Inputs

## 12.1 Duplicate Start Webhook
If duplicate start webhook arrives:
- do not create duplicate conversation
- store webhook receipt
- link to existing conversation if appropriate
- record duplicate processing result

## 12.2 Duplicate Inbound SMS
If same inbound provider event arrives twice:
- dedupe by provider identifiers if available
- do not append duplicate message
- record duplicate receipt handling

## 12.3 Duplicate Send Job
If same send job is retried:
- use send idempotency key
- do not create duplicate outbound message or double-send to provider
- record retry outcome clearly

---

# 13. Reopen Policy

## 13.1 MVP Recommendation
Do not support generic reopening of terminal conversations in MVP.

Instead:
- future contact should usually create a new conversation
- transcript history can still be referenced by services/UI

## 13.2 Future Option
A future feature may support:
- reopen from `completed`
- reopen from `failed`
- new conversation linked to prior conversation chain

This is out of scope for initial implementation.

---

# 14. State Machine Pseudocode

## 14.1 Transition Function Shape
The system should centralize transition logic in a service similar to:

```ts
type ConversationStatus =
  | "queued"
  | "active"
  | "waiting_for_lead"
  | "paused_business_hours"
  | "paused_manual"
  | "needs_human"
  | "human_controlled"
  | "completed"
  | "opted_out"
  | "failed";

type TransitionRequest = {
  conversationId: string;
  nextStatus: ConversationStatus;
  actorType: "system" | "ai" | "lead" | "human" | "provider_webhook" | "scheduler";
  actorId?: string | null;
  reasonCode: string;
  summary?: string;
  metadata?: Record<string, unknown>;
};

async function transitionConversation(req: TransitionRequest): Promise<void> {
  // 1. lock current conversation row
  // 2. load current state
  // 3. validate transition is allowed
  // 4. apply guard conditions
  // 5. mutate current-state row
  // 6. append conversation event
  // 7. enqueue required side effects
}
```

## 14.2 Important Engineering Rule
Do not spread raw status mutation logic across many services.
Use a central transition service or workflow module.

---

# 15. Frontend/UI Implications

## 15.1 Inbox Filters
The inbox should at minimum support filters for:
- `needs_human`
- `human_controlled`
- `waiting_for_lead`
- `active`
- `completed`
- `opted_out`
- `failed`

## 15.2 Conversation Detail View
The detail view should surface:
- current status
- outcome
- assigned campaign
- assigned agent
- assigned agent version
- lead details
- transcript
- recent events
- manual controls:
  - pause
  - resume
  - takeover
  - release
  - close

## 15.3 Human Safety Controls
When status is `human_controlled`, UI should clearly indicate:
- AI automation is paused
- manual messages are being sent by a user
- release action is required to resume automation

---

# 16. QA Test Matrix

## 16.1 Minimum State Tests
QA should verify at least:

1. start webhook creates `queued`
2. queued work moves to `active`
3. successful send moves to `waiting_for_lead`
4. inbound reply moves to `queued`
5. outside-business-hours send moves to `paused_business_hours`
6. scheduler release moves back to `queued`
7. AI escalation moves to `needs_human`
8. human takeover moves to `human_controlled`
9. release returns to `queued`
10. opt-out from any non-terminal state moves to `opted_out`
11. no-response timeout moves to `completed` with `no_response`
12. booking confirmation moves to `completed` with `booked`
13. repeated unrecoverable failure moves to `failed`

## 16.2 Idempotency Tests
QA should verify:
- duplicate webhook does not duplicate conversation
- duplicate inbound SMS does not duplicate message
- duplicate send retry does not double-send SMS

## 16.3 Human Override Tests
QA should verify:
- AI does not continue while `human_controlled = true`
- human pause blocks automation
- manual close sets final state correctly

---

# 17. Open Questions

These do not block implementation, but should be revisited:

1. Should `queued` distinguish between different pending work types in current state, or is that only a job concern?
2. Should `needs_human` and `human_controlled` be kept as separate statuses long term? For MVP, yes.
3. Should business-hours release always return to `queued`, or occasionally directly to `active`? Recommendation: return to `queued` for consistency.
4. Should inbound lead messages be allowed to wake a `paused_manual` conversation automatically? MVP recommendation: no, surface for human review or explicit resume.
5. Should inbound lead messages during `human_controlled` continue to append to transcript? Yes.
6. Should `completed` plus `booked` be the only booked terminal path, or should there be a dedicated `booked` status? Recommendation: keep `completed` + outcome `booked`.

---

# 18. Summary for AI Coding Agents

Implement conversation orchestration as an explicit state machine with:
- centralized transition validation
- explicit guards
- append-only event logging
- queue-backed side effects
- clear distinction between status and outcome
- strict suppression of automation during human takeover
- strict opt-out handling
- idempotent webhook and job processing

This state machine should be implemented before advanced UI polish, because it defines the core correctness of the product.
