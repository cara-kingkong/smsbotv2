
# api-contracts.md

## Purpose
This document defines the first-pass API contracts for the multi-workspace SMS chatbot platform.

It is written for:
- backend engineers
- frontend engineers
- integration engineers
- AI coding agents
- QA engineers

This document is intentionally:
- implementation-oriented
- explicit about request/response shapes
- explicit about validation rules
- designed to reduce ambiguity for AI-assisted coding

This is a contract/spec document, not a final OpenAPI file.
It should later be translated into:
- route handlers
- request validators
- response schemas
- SDK helpers
- automated tests
- eventual OpenAPI definitions if desired

---

# 1. API Design Principles

## 1.1 Primary Goals
The API must:
- preserve strict workspace scoping
- support idempotent writes
- allow external systems to start conversations
- support reliable webhook ingestion
- support human inbox workflows
- support safe provider integrations
- be easy for AI coding agents to implement

## 1.2 Architectural Split
There are three broad API categories:

1. **Admin/Application API**
   - used by the Astro admin app
   - authenticated
   - workspace-scoped

2. **Inbound Webhook API**
   - used by Twilio, Calendly, and generic upstream systems
   - usually unauthenticated but signature/secret validated
   - idempotent

3. **Internal Job/Provider Callback Interfaces**
   - used by queue workers / server-side services
   - not public in the browser sense
   - still should use explicit payload contracts

## 1.3 Contract Rules
- Every write contract must validate input strictly.
- Every webhook contract should store a receipt before heavy processing where feasible.
- Every endpoint that can be retried should support idempotency.
- Every admin API response should include enough IDs for UI follow-up actions.
- Avoid hidden side effects that are not represented in either current-state tables or event tables.

---

# 2. Common Conventions

## 2.1 IDs
Use UUID strings for platform entity IDs.

Examples:
- `workspace_id`
- `campaign_id`
- `agent_id`
- `agent_version_id`
- `conversation_id`
- `lead_id`
- `integration_id`
- `calendar_id`
- `message_id`

## 2.2 Timestamps
Use ISO 8601 UTC timestamps in API responses.

Example:
`2026-03-25T03:15:00Z`

## 2.3 Authentication
Admin APIs should use authenticated session/user context.
Do not trust `workspace_id` from the client without membership validation.

## 2.4 Envelope Style
Recommended response envelope for admin APIs:

```json
{
  "data": {},
  "meta": {},
  "error": null
}
```

Recommended error envelope:

```json
{
  "data": null,
  "meta": {},
  "error": {
    "code": "validation_error",
    "message": "Invalid request payload",
    "details": {}
  }
}
```

## 2.5 Pagination
List endpoints should use cursor or page-based pagination.
Cursor pagination is preferred for conversations/messages.

Recommended meta shape:

```json
{
  "next_cursor": "opaque-string-or-null",
  "has_more": true
}
```

## 2.6 Idempotency
For retriable write endpoints, support an `Idempotency-Key` header when practical.

Webhook receipts should also support payload-level idempotency keys where available.

## 2.7 Workspace Resolution
For admin APIs, workspace is usually resolved via path parameter:
- `/api/workspaces/:workspaceId/...`

For generic incoming webhooks, workspace may be resolved by:
- explicit `workspace_slug`
- explicit `workspace_id`
- integration secret/token
- endpoint-specific secret mapping

---

# 3. Shared Type Vocabulary

## 3.1 Core Enums
These values should match database and domain types.

### ConversationStatus
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

### ConversationOutcome
- `booked`
- `qualified_not_booked`
- `unqualified`
- `no_response`
- `opted_out`
- `human_takeover`
- `other`

### IntegrationType
- `sms`
- `crm`
- `calendar`
- `ai_provider`

### IntegrationProvider
- `twilio`
- `keap`
- `calendly`
- `openai`
- `anthropic`

---

# 4. Admin/Application API

# 4.1 Workspace Summary Endpoints

## GET /api/workspaces
Purpose:
Return workspaces visible to current user.

### Response
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "King Kong AU",
      "slug": "king-kong-au",
      "role": "admin",
      "status": "active"
    }
  ],
  "meta": {},
  "error": null
}
```

## GET /api/workspaces/:workspaceId
Purpose:
Return a single workspace summary and settings.

### Response
```json
{
  "data": {
    "id": "uuid",
    "name": "King Kong AU",
    "slug": "king-kong-au",
    "status": "active",
    "settings": {}
  },
  "meta": {},
  "error": null
}
```

---

# 4.2 Campaign Endpoints

## GET /api/workspaces/:workspaceId/campaigns
Purpose:
List campaigns for a workspace.

### Query Params
- `status` optional
- `cursor` optional
- `limit` optional

### Response
```json
{
  "data": [
    {
      "id": "uuid",
      "workspace_id": "uuid",
      "name": "SMS Lead Qualifier",
      "slug": "sms-lead-qualifier",
      "status": "active",
      "description": "Main inbound lead qualification campaign"
    }
  ],
  "meta": {
    "next_cursor": null,
    "has_more": false
  },
  "error": null
}
```

## POST /api/workspaces/:workspaceId/campaigns
Purpose:
Create a campaign.

### Request
```json
{
  "name": "SMS Lead Qualifier",
  "slug": "sms-lead-qualifier",
  "description": "Main inbound lead qualification campaign",
  "business_hours": {
    "timezone_mode": "lead",
    "days": {
      "mon": [{ "start": "09:00", "end": "17:00" }],
      "tue": [{ "start": "09:00", "end": "17:00" }]
    }
  },
  "stop_conditions": {
    "opt_out_keywords": ["stop", "unsubscribe", "quit"],
    "max_outbound_without_reply": 3,
    "pause_on_human_takeover": true
  },
  "settings": {}
}
```

### Validation Rules
- `name` required
- `slug` optional but unique within workspace if provided
- `business_hours` must match known schema
- `stop_conditions` must match known schema

### Response
```json
{
  "data": {
    "id": "uuid",
    "workspace_id": "uuid",
    "name": "SMS Lead Qualifier",
    "slug": "sms-lead-qualifier",
    "status": "draft"
  },
  "meta": {},
  "error": null
}
```

## PATCH /api/workspaces/:workspaceId/campaigns/:campaignId
Purpose:
Update campaign fields.

### Request
Partial update allowed.

```json
{
  "status": "active",
  "description": "Updated description"
}
```

### Response
Updated campaign object.

## GET /api/workspaces/:workspaceId/campaigns/:campaignId
Purpose:
Fetch campaign detail including agent summary counts.

---

# 4.3 Agent Endpoints

## GET /api/workspaces/:workspaceId/campaigns/:campaignId/agents
Purpose:
List agents for a campaign.

### Response
```json
{
  "data": [
    {
      "id": "uuid",
      "campaign_id": "uuid",
      "name": "Agent A",
      "status": "active",
      "weight": 70,
      "ai_provider_integration_id": "uuid",
      "active_version": {
        "id": "uuid",
        "version_number": 3
      }
    }
  ],
  "meta": {},
  "error": null
}
```

## POST /api/workspaces/:workspaceId/campaigns/:campaignId/agents
Purpose:
Create agent.

### Request
```json
{
  "name": "Agent A",
  "description": "Main qualification prompt",
  "status": "draft",
  "weight": 70,
  "ai_provider_integration_id": "uuid"
}
```

### Validation
- `weight` must be positive integer
- provider integration must belong to workspace and be AI type

## PATCH /api/workspaces/:workspaceId/campaigns/:campaignId/agents/:agentId
Purpose:
Update agent metadata.

### Request
```json
{
  "status": "active",
  "weight": 50
}
```

## GET /api/workspaces/:workspaceId/campaigns/:campaignId/agents/:agentId
Purpose:
Fetch agent detail including versions and calendar assignments.

---

# 4.4 Agent Version Endpoints

## POST /api/workspaces/:workspaceId/agents/:agentId/versions
Purpose:
Create a new agent version.

### Request
```json
{
  "prompt_text": "You are a helpful SMS assistant for lead qualification.",
  "system_rules": {
    "tone": "friendly, concise, human",
    "max_message_length": 320
  },
  "reply_cadence": {
    "initial_reply_delay_seconds": 30,
    "followup_delay_minutes": 15,
    "max_followups": 3
  },
  "allowed_actions": {
    "can_book": true,
    "can_escalate_to_human": true,
    "can_close_unqualified": true
  },
  "qualification_rules": {
    "required_fields": ["budget", "service_interest"]
  },
  "config": {}
}
```

### Side Effects
- assign next `version_number`
- create row with `is_active = false` unless explicitly activated later

### Response
```json
{
  "data": {
    "id": "uuid",
    "agent_id": "uuid",
    "version_number": 4,
    "is_active": false
  },
  "meta": {},
  "error": null
}
```

## POST /api/workspaces/:workspaceId/agents/:agentId/versions/:versionId/activate
Purpose:
Activate a specific version.

### Rules
- exactly one active version per agent
- previous active version must be deactivated in same transaction

### Response
```json
{
  "data": {
    "agent_id": "uuid",
    "active_version_id": "uuid",
    "version_number": 4
  },
  "meta": {},
  "error": null
}
```

---

# 4.5 Integration Endpoints

## GET /api/workspaces/:workspaceId/integrations
Purpose:
List integrations for workspace.

## POST /api/workspaces/:workspaceId/integrations
Purpose:
Create integration metadata and store secrets via secret manager flow.

### Request
```json
{
  "type": "crm",
  "provider": "keap",
  "name": "Primary Keap",
  "config": {
    "app_name": "example-app",
    "default_tags": {
      "booked": "Booked",
      "qualified": "Qualified"
    }
  },
  "secrets": {
    "api_key": "secret-value"
  }
}
```

### Important Note
In production, the API should avoid echoing secrets back.
Prefer a separate secure path for writing secrets.

### Response
```json
{
  "data": {
    "id": "uuid",
    "type": "crm",
    "provider": "keap",
    "name": "Primary Keap",
    "status": "pending"
  },
  "meta": {},
  "error": null
}
```

## POST /api/workspaces/:workspaceId/integrations/:integrationId/test
Purpose:
Run healthcheck on integration.

### Response
```json
{
  "data": {
    "integration_id": "uuid",
    "status": "active",
    "healthcheck": {
      "ok": true,
      "message": "Connection successful"
    }
  },
  "meta": {},
  "error": null
}
```

---

# 4.6 Calendar Endpoints

## GET /api/workspaces/:workspaceId/calendars
Purpose:
List calendars in workspace.

## POST /api/workspaces/:workspaceId/calendars
Purpose:
Create/import a calendar target.

### Request
```json
{
  "integration_id": "uuid",
  "name": "Consulting Calls",
  "external_calendar_id": "cal_123",
  "booking_url": "https://calendly.com/example/consulting-call",
  "eligibility_rules": {
    "required_fields": ["budget"],
    "rules": [
      { "field": "budget", "operator": ">=", "value": 3000 }
    ]
  },
  "settings": {}
}
```

## POST /api/workspaces/:workspaceId/agents/:agentId/calendars
Purpose:
Assign calendar to agent.

### Request
```json
{
  "calendar_id": "uuid"
}
```

---

# 4.7 Conversation Endpoints

## GET /api/workspaces/:workspaceId/conversations
Purpose:
List conversations for inbox/dashboard.

### Query Params
- `status`
- `outcome`
- `campaign_id`
- `agent_id`
- `needs_human`
- `human_controlled`
- `search`
- `cursor`
- `limit`

### Response
```json
{
  "data": [
    {
      "id": "uuid",
      "lead": {
        "id": "uuid",
        "display_name": "Jane Smith",
        "phone_e164": "+61400000000"
      },
      "campaign": {
        "id": "uuid",
        "name": "SMS Lead Qualifier"
      },
      "agent": {
        "id": "uuid",
        "name": "Agent A",
        "version_number": 3
      },
      "status": "needs_human",
      "outcome": null,
      "needs_human": true,
      "human_controlled": false,
      "last_activity_at": "2026-03-25T03:15:00Z"
    }
  ],
  "meta": {
    "next_cursor": null,
    "has_more": false
  },
  "error": null
}
```

## GET /api/workspaces/:workspaceId/conversations/:conversationId
Purpose:
Fetch conversation detail for transcript view.

### Response
```json
{
  "data": {
    "id": "uuid",
    "status": "waiting_for_lead",
    "outcome": null,
    "lead": {
      "id": "uuid",
      "display_name": "Jane Smith",
      "phone_e164": "+61400000000",
      "email": "jane@example.com",
      "timezone": "Australia/Melbourne",
      "opted_out": false
    },
    "campaign": {
      "id": "uuid",
      "name": "SMS Lead Qualifier"
    },
    "agent": {
      "id": "uuid",
      "name": "Agent A"
    },
    "agent_version": {
      "id": "uuid",
      "version_number": 3
    },
    "assigned_user_id": null,
    "messages": [],
    "recent_events": []
  },
  "meta": {},
  "error": null
}
```

## POST /api/workspaces/:workspaceId/conversations/:conversationId/messages
Purpose:
Send a manual message into the conversation.

### Request
```json
{
  "body_text": "Hey Jane — just jumping in here to help. Happy to answer any questions.",
  "send_immediately": true
}
```

### Rules
- if `human_controlled` is false, sending a manual message may either:
  - force takeover automatically, or
  - be disallowed
- MVP recommendation: manual send should force human takeover

### Response
```json
{
  "data": {
    "message_id": "uuid",
    "conversation_id": "uuid",
    "sender_type": "human",
    "delivery_status": "queued"
  },
  "meta": {},
  "error": null
}
```

## POST /api/workspaces/:workspaceId/conversations/:conversationId/takeover
Purpose:
Human takes control.

### Request
```json
{
  "reason": "Lead asked a complex compliance question"
}
```

### Response
```json
{
  "data": {
    "conversation_id": "uuid",
    "status": "human_controlled",
    "human_controlled": true,
    "assigned_user_id": "uuid"
  },
  "meta": {},
  "error": null
}
```

## POST /api/workspaces/:workspaceId/conversations/:conversationId/release
Purpose:
Return conversation to automation.

### Request
```json
{
  "reason": "Issue resolved, okay to resume automation"
}
```

### Response
```json
{
  "data": {
    "conversation_id": "uuid",
    "status": "queued",
    "human_controlled": false
  },
  "meta": {},
  "error": null
}
```

## POST /api/workspaces/:workspaceId/conversations/:conversationId/pause
Purpose:
Pause conversation without full takeover.

### Request
```json
{
  "reason": "Waiting on internal answer"
}
```

## POST /api/workspaces/:workspaceId/conversations/:conversationId/resume
Purpose:
Resume manually paused conversation.

## POST /api/workspaces/:workspaceId/conversations/:conversationId/close
Purpose:
Close conversation with explicit outcome.

### Request
```json
{
  "outcome": "qualified_not_booked",
  "reason": "Lead qualified but asked not to book yet"
}
```

---

# 4.8 Reporting Endpoints

## GET /api/workspaces/:workspaceId/reporting/summary
Purpose:
Return top-level dashboard metrics.

### Query Params
- `from`
- `to`
- `campaign_id` optional

### Response
```json
{
  "data": {
    "conversations_started": 124,
    "active_conversations": 18,
    "booked_conversations": 32,
    "qualified_not_booked": 17,
    "unqualified": 28,
    "no_response": 21,
    "opt_out_rate": 0.08,
    "human_takeover_rate": 0.14,
    "avg_time_to_first_response_seconds": 83
  },
  "meta": {},
  "error": null
}
```

## GET /api/workspaces/:workspaceId/reporting/agents
Purpose:
Return per-agent comparison metrics.

### Response
```json
{
  "data": [
    {
      "agent_id": "uuid",
      "agent_name": "Agent A",
      "agent_version_id": "uuid",
      "version_number": 3,
      "conversations_started": 60,
      "booked_rate": 0.31,
      "opt_out_rate": 0.05,
      "human_takeover_rate": 0.12
    }
  ],
  "meta": {},
  "error": null
}
```

---

# 5. Generic Start Conversation Webhook

## 5.1 Endpoint
`POST /webhooks/start-conversation`

Purpose:
Allow any upstream system to start a conversation without tight CRM coupling.

## 5.2 Authentication / Validation
Support one or more of:
- shared secret header
- signed request
- integration-specific token
- IP allowlist later if needed

For MVP, simplest safe option:
- `X-Webhook-Secret: <shared-secret>`

## 5.3 Request Shape
```json
{
  "workspace_slug": "king-kong-au",
  "campaign_slug": "sms-lead-qualifier",
  "idempotency_key": "crm-event-12345",
  "lead": {
    "external_contact_id": "123",
    "first_name": "Jane",
    "last_name": "Smith",
    "display_name": "Jane Smith",
    "email": "jane@example.com",
    "phone_e164": "+61400000000",
    "timezone": "Australia/Melbourne"
  },
  "source": {
    "type": "crm_webhook",
    "provider": "keap",
    "reference": "tag-applied"
  },
  "attributes": {
    "service_interest": "seo",
    "budget": 5000,
    "tags": ["new_lead"]
  }
}
```

## 5.4 Minimum Validation Rules
- workspace resolvable
- campaign resolvable within workspace
- lead phone present and normalized
- idempotency key optional but strongly recommended
- if present, duplicate idempotency key must not create duplicate conversation

## 5.5 Synchronous Response Strategy
Recommended:
- acknowledge receipt quickly
- create receipt row
- either create conversation inline or enqueue start job

### Response
```json
{
  "data": {
    "accepted": true,
    "conversation_id": "uuid",
    "lead_id": "uuid",
    "status": "queued"
  },
  "meta": {},
  "error": null
}
```

## 5.6 Duplicate Response Example
```json
{
  "data": {
    "accepted": true,
    "duplicate": true,
    "conversation_id": "existing-conversation-uuid"
  },
  "meta": {},
  "error": null
}
```

---

# 6. Twilio Webhook Contracts

# 6.1 Inbound SMS Webhook

## Endpoint
`POST /webhooks/twilio/inbound-sms`

## Purpose
Receive inbound SMS replies from Twilio.

## Validation
- verify Twilio signature
- store raw webhook receipt
- dedupe if provider event already seen

## Expected Form-Encoded Fields
Twilio typically sends form data like:
- `MessageSid`
- `From`
- `To`
- `Body`
- `SmsStatus`
- `AccountSid`

## Internal Normalized Contract
After parsing, normalize to:
```json
{
  "provider": "twilio",
  "event_type": "inbound_sms",
  "provider_message_id": "SMxxxxxxxx",
  "from_phone_e164": "+61400000000",
  "to_phone_e164": "+18000000000",
  "body_text": "Hey, yep that sounds good",
  "received_at": "2026-03-25T03:15:00Z",
  "raw_payload": {}
}
```

## Response
Return TwiML or simple 200 depending on chosen pattern.
For MVP, a basic 200 is acceptable if replies are processed asynchronously.

---

# 6.2 Delivery Status Webhook

## Endpoint
`POST /webhooks/twilio/message-status`

## Purpose
Track delivery state for outbound messages.

## Normalized Contract
```json
{
  "provider": "twilio",
  "event_type": "message_status",
  "provider_message_id": "SMxxxxxxxx",
  "message_status": "delivered",
  "error_code": null,
  "raw_payload": {}
}
```

## Side Effects
- resolve message by provider ID
- update message delivery status
- append event if useful

---

# 7. Calendly Callback Contracts

## 7.1 Booking Created Webhook

### Endpoint
`POST /webhooks/calendly/booking-created`

### Purpose
Capture booking confirmation and complete conversation where appropriate.

### Validation
- verify provider signing secret if available
- store receipt before processing

### Internal Normalized Contract
```json
{
  "provider": "calendly",
  "event_type": "booking_created",
  "external_booking_id": "booking_123",
  "calendar_external_id": "cal_123",
  "invitee": {
    "email": "jane@example.com",
    "name": "Jane Smith"
  },
  "scheduled_at": "2026-03-26T01:00:00Z",
  "raw_payload": {}
}
```

### Matching Strategy
Try matching in this order:
1. conversation-linked booking token
2. lead external reference
3. lead email + recent booking event context
4. manual review if ambiguous

### Response
200 if accepted.

---

# 8. Keap/CRM Outcome Interfaces

## 8.1 API Shape Inside App
These are usually not public routes exposed to third parties.
They are service contracts used by internal job processors.

### Normalized CRMEvent Input
```json
{
  "workspace_id": "uuid",
  "integration_id": "uuid",
  "event_type": "apply_tag",
  "lead_id": "uuid",
  "conversation_id": "uuid",
  "payload": {
    "external_contact_id": "123",
    "tag_name": "Booked"
  }
}
```

### Normalized CRMEvent Result
```json
{
  "success": true,
  "provider_reference": "keap-response-id",
  "raw_response": {}
}
```

---

# 9. Internal Service Contracts

# 9.1 Conversation Creation Service

## Input
```json
{
  "workspace_id": "uuid",
  "campaign_id": "uuid",
  "lead": {
    "phone_e164": "+61400000000",
    "email": "jane@example.com",
    "display_name": "Jane Smith"
  },
  "source": {
    "type": "webhook",
    "reference": "crm-event-123"
  },
  "attributes": {}
}
```

## Output
```json
{
  "conversation_id": "uuid",
  "lead_id": "uuid",
  "agent_id": "uuid",
  "agent_version_id": "uuid",
  "status": "queued"
}
```

## Rules
- must be idempotent where idempotency key exists
- must resolve agent by weighted selection
- must resolve active agent version
- must create conversation event

---

# 9.2 AI Evaluation Service Contract

## Input
```json
{
  "conversation_id": "uuid"
}
```

## Internal Loaded Context
The service should assemble:
- workspace settings
- campaign settings
- agent version
- transcript
- lead attributes
- calendar assignments
- business rules

## Expected AI Decision Object
```json
{
  "should_reply": true,
  "reply_text": "Sounds great. Based on what you said, I can help you book a call.",
  "qualification_state": "qualified",
  "should_book": true,
  "recommended_calendar_id": "uuid",
  "escalate_to_human": false,
  "tags_to_emit": ["qualified"],
  "confidence_notes": ["Lead provided budget and service interest"],
  "reason_summary": "Lead meets qualification criteria"
}
```

## Validation Rules
- `reply_text` required if `should_reply = true`
- `recommended_calendar_id` must be nullable string
- `qualification_state` must come from supported values
- AI output must be validated before any side effect

---

# 9.3 Manual Send Service Contract

## Input
```json
{
  "conversation_id": "uuid",
  "user_id": "uuid",
  "body_text": "Hey Jane — happy to help from here.",
  "force_takeover": true
}
```

## Output
```json
{
  "message_id": "uuid",
  "delivery_status": "queued",
  "conversation_status": "human_controlled"
}
```

---

# 10. Error Codes

## 10.1 Common Error Codes
Recommended machine-readable codes:

- `unauthorized`
- `forbidden`
- `not_found`
- `validation_error`
- `conflict`
- `duplicate_request`
- `invalid_state_transition`
- `provider_validation_failed`
- `provider_unavailable`
- `workspace_mismatch`
- `integration_inactive`
- `conversation_terminal`
- `lead_opted_out`

## 10.2 Example Error
```json
{
  "data": null,
  "meta": {},
  "error": {
    "code": "invalid_state_transition",
    "message": "Conversation cannot be released because it is already completed",
    "details": {
      "conversation_id": "uuid",
      "current_status": "completed",
      "requested_action": "release"
    }
  }
}
```

---

# 11. Validation Rules by Domain

## 11.1 Phone Numbers
- normalize to E.164 before persistence
- reject obviously invalid formats
- never trust external systems to normalize correctly

## 11.2 Workspace Scope
- any `campaign_id`, `agent_id`, `conversation_id`, `integration_id`, `calendar_id` supplied in admin requests must be validated against workspace ownership

## 11.3 Agent Activation
- only one active version per agent
- agent activation endpoint must use transactional update

## 11.4 Manual Conversation Actions
- `takeover` only allowed on non-terminal states
- `release` not allowed from terminal states
- `pause` not allowed if already terminal
- `close` requires valid outcome if outcome is provided

---

# 12. Suggested Route Groups for Implementation

```text
/api
  /workspaces
  /workspaces/:workspaceId
  /workspaces/:workspaceId/campaigns
  /workspaces/:workspaceId/campaigns/:campaignId
  /workspaces/:workspaceId/campaigns/:campaignId/agents
  /workspaces/:workspaceId/agents/:agentId/versions
  /workspaces/:workspaceId/integrations
  /workspaces/:workspaceId/calendars
  /workspaces/:workspaceId/conversations
  /workspaces/:workspaceId/conversations/:conversationId
  /workspaces/:workspaceId/reporting

/webhooks
  /start-conversation
  /twilio/inbound-sms
  /twilio/message-status
  /calendly/booking-created
```

---

# 13. QA Contract Checklist

QA should verify:
1. workspace membership enforced on every admin endpoint
2. invalid payloads return `validation_error`
3. duplicate start webhook does not create duplicate conversation
4. duplicate Twilio webhook does not duplicate message
5. manual send forces takeover if designed that way
6. invalid release/close actions return `invalid_state_transition`
7. delivery webhooks update message delivery status
8. booking webhook can complete a conversation
9. healthcheck endpoint reflects integration state clearly

---

# 14. Summary for AI Coding Agents

Implement APIs with:
- strict request validation
- centralized workspace ownership checks
- idempotent webhook handling
- clear domain-specific error codes
- normalized provider payload parsing
- stable response envelopes
- validated AI decision object contracts

These contracts should drive:
- validators
- route handlers
- internal services
- integration tests
- future OpenAPI output
