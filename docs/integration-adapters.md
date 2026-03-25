
# integration-adapters.md

## Purpose
This document defines the provider adapter model for the multi-workspace SMS chatbot platform.

It is written for:
- backend engineers
- integration engineers
- AI coding agents
- system architects

This document explains:
- why adapters exist
- what interfaces are required
- which provider-specific behaviors belong inside adapters
- what the normalized internal contracts should look like
- what not to leak into shared business logic

This is an interface and architecture document, not final code.
It should guide:
- TypeScript interfaces
- adapter implementations
- provider tests
- integration healthchecks
- mocking and local development

---

# 1. Why Adapters Exist

## 1.1 Problem
This product will support multiple providers over time for:
- SMS
- CRM
- calendar booking
- AI generation

If provider SDK code is spread across services, the codebase becomes:
- harder to test
- harder to replace providers
- harder for AI coding agents to understand safely
- full of hidden provider-specific assumptions

## 1.2 Solution
Use explicit adapter boundaries.

Shared business logic should ask for capabilities like:
- send SMS
- apply CRM tag
- create booking
- generate AI decision

It should **not** care whether the provider is:
- Twilio
- Keap
- Calendly
- OpenAI
- Anthropic

## 1.3 Design Rule
The application core should depend on internal interfaces.
Provider-specific code should depend on provider SDKs.

---

# 2. Adapter Categories

The system needs these adapter categories:

1. `SMSAdapter`
2. `CRMAdapter`
3. `CalendarAdapter`
4. `AIProviderAdapter`

Optional future categories:
- voice
- email
- analytics
- payments
- authentication

---

# 3. Cross-Cutting Adapter Principles

## 3.1 Inputs and Outputs Must Be Normalized
Adapters should accept and return platform-defined shapes.

Do not expose raw provider SDK objects above the adapter layer unless debugging explicitly needs them.

## 3.2 Adapters Must Be Workspace-Aware
Adapters should be instantiated or configured using the workspace integration record.

This usually means:
- integration metadata from `integrations`
- secrets from secret storage
- provider-specific config

## 3.3 Adapters Must Be Safe to Retry
Where provider calls may be retried:
- support idempotency keys if provider supports them
- persist provider references
- do not let shared services accidentally duplicate side effects

## 3.4 Adapters Must Support Healthchecks
Every adapter should expose a lightweight `healthCheck()` method.

## 3.5 Adapters Must Preserve Raw Provider Data
Where useful for debugging/audit:
- return normalized data
- also include raw response payload for persistence/logging

## 3.6 Adapters Must Not Mutate Core State Directly
Adapters should not directly update conversation status, lead status, or campaign data.
They return results.
Shared services decide how platform state changes.

---

# 4. Shared Base Types

These are conceptual internal types the adapters should use.

## 4.1 IntegrationContext
```ts
type IntegrationContext = {
  workspaceId: string;
  integrationId: string;
  provider: string;
  config: Record<string, unknown>;
  secrets: Record<string, unknown>;
};
```

## 4.2 HealthCheckResult
```ts
type HealthCheckResult = {
  ok: boolean;
  message: string;
  metadata?: Record<string, unknown>;
  raw?: unknown;
};
```

## 4.3 AdapterResult
```ts
type AdapterResult<T> = {
  success: boolean;
  data?: T;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  raw?: unknown;
};
```

---

# 5. SMS Adapter

## 5.1 Responsibilities
The SMS adapter is responsible for:
- sending outbound SMS
- validating inbound webhook signatures
- normalizing inbound webhook payloads
- normalizing delivery status callbacks
- optionally fetching provider delivery info

The first implementation will be `TwilioSMSAdapter`.

## 5.2 Interface
```ts
type SendSMSInput = {
  toPhoneE164: string;
  fromPhoneE164?: string | null;
  bodyText: string;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
};

type SendSMSResult = {
  providerMessageId: string;
  providerStatus: string;
  acceptedAt?: string | null;
};

type NormalizedInboundSMS = {
  provider: "twilio" | string;
  providerMessageId: string;
  fromPhoneE164: string;
  toPhoneE164: string;
  bodyText: string;
  receivedAt: string;
  rawPayload: Record<string, unknown>;
};

type NormalizedMessageStatus = {
  provider: "twilio" | string;
  providerMessageId: string;
  providerStatus: string;
  errorCode?: string | null;
  rawPayload: Record<string, unknown>;
};

interface SMSAdapter {
  healthCheck(): Promise<AdapterResult<HealthCheckResult>>;
  sendMessage(input: SendSMSInput): Promise<AdapterResult<SendSMSResult>>;
  validateInboundWebhook(args: {
    headers: Record<string, string | string[] | undefined>;
    rawBody: string;
    url: string;
  }): Promise<AdapterResult<{ valid: boolean }>>;
  parseInboundWebhook(args: {
    headers: Record<string, string | string[] | undefined>;
    body: unknown;
  }): Promise<AdapterResult<NormalizedInboundSMS>>;
  parseStatusWebhook(args: {
    headers: Record<string, string | string[] | undefined>;
    body: unknown;
  }): Promise<AdapterResult<NormalizedMessageStatus>>;
}
```

## 5.3 What Belongs in Twilio Adapter
- Twilio SDK/API calls
- Twilio signature validation
- form-urlencoded payload parsing
- mapping Twilio statuses to internal statuses

## 5.4 What Must Not Leak Out
Do not make shared services depend on:
- raw Twilio request field names
- Twilio SDK response classes
- TwiML generation details unless intentionally abstracted

## 5.5 Twilio Mapping Notes
Common provider statuses may map like:
- `queued` -> internal `queued`
- `sent` -> internal `sent`
- `delivered` -> internal `delivered`
- `failed` -> internal `failed`
- `undelivered` -> internal `undelivered`

---

# 6. CRM Adapter

## 6.1 Responsibilities
CRM adapters are responsible for:
- applying tags/labels
- creating contact notes
- future contact upsert/update actions
- translating normalized internal outcome events into provider-specific API requests

The first implementation will be `KeapCRMAdapter`.

## 6.2 Interface
```ts
type ApplyTagInput = {
  externalContactId: string;
  tagName: string;
  metadata?: Record<string, unknown>;
};

type CreateNoteInput = {
  externalContactId: string;
  bodyText: string;
  metadata?: Record<string, unknown>;
};

type UpsertContactReferenceInput = {
  externalContactId?: string | null;
  email?: string | null;
  phoneE164?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  attributes?: Record<string, unknown>;
};

type CRMWriteResult = {
  providerReference?: string | null;
};

interface CRMAdapter {
  healthCheck(): Promise<AdapterResult<HealthCheckResult>>;
  applyTag(input: ApplyTagInput): Promise<AdapterResult<CRMWriteResult>>;
  createNote(input: CreateNoteInput): Promise<AdapterResult<CRMWriteResult>>;
  upsertContactReference?(
    input: UpsertContactReferenceInput
  ): Promise<AdapterResult<CRMWriteResult>>;
}
```

## 6.3 Normalized Internal CRM Event Types
The shared system should define normalized types like:
- `apply_tag`
- `create_note`
- `emit_outcome`
- `upsert_contact_reference`

These are internal platform concepts.
A Keap adapter can map them into concrete Keap API actions.

## 6.4 What Belongs in Keap Adapter
- auth headers / API key use
- Keap endpoint construction
- Keap-specific payload shapes
- Keap-specific response parsing
- provider-specific retry classification

## 6.5 What Must Not Leak Out
Do not hardcode shared business logic around:
- Keap-only terminology
- provider-specific path names
- provider-specific tag IDs unless intentionally configured

## 6.6 Keap Notes
For MVP:
- use tag apply + note create as core operations
- keep contact identity mapping simple
- prefer external contact ID if available
- fall back only if clearly defined and safe

---

# 7. Calendar Adapter

## 7.1 Responsibilities
Calendar adapters are responsible for:
- validating access to calendars
- listing or verifying bookable targets
- creating bookings if direct booking is supported
- cancelling/rescheduling later if needed
- normalizing booking callback/provider payloads

The first implementation will be `CalendlyCalendarAdapter`.

## 7.2 Interface
```ts
type CalendarAvailabilityInput = {
  externalCalendarId: string;
  fromIso?: string | null;
  toIso?: string | null;
};

type CalendarAvailabilityResult = {
  available: boolean;
  slots?: Array<{
    startAt: string;
    endAt: string;
  }>;
};

type CreateBookingInput = {
  externalCalendarId: string;
  lead: {
    name?: string | null;
    email?: string | null;
    phoneE164?: string | null;
  };
  scheduledAt?: string | null;
  metadata?: Record<string, unknown>;
};

type CreateBookingResult = {
  externalBookingId: string;
  bookingUrl?: string | null;
  scheduledAt?: string | null;
};

type NormalizedBookingCreatedEvent = {
  provider: "calendly" | string;
  externalBookingId: string;
  externalCalendarId?: string | null;
  inviteeName?: string | null;
  inviteeEmail?: string | null;
  scheduledAt?: string | null;
  rawPayload: Record<string, unknown>;
};

interface CalendarAdapter {
  healthCheck(): Promise<AdapterResult<HealthCheckResult>>;
  checkAvailability?(
    input: CalendarAvailabilityInput
  ): Promise<AdapterResult<CalendarAvailabilityResult>>;
  createBooking?(
    input: CreateBookingInput
  ): Promise<AdapterResult<CreateBookingResult>>;
  validateWebhook?(args: {
    headers: Record<string, string | string[] | undefined>;
    rawBody: string;
  }): Promise<AdapterResult<{ valid: boolean }>>;
  parseBookingCreatedWebhook?(args: {
    headers: Record<string, string | string[] | undefined>;
    body: unknown;
  }): Promise<AdapterResult<NormalizedBookingCreatedEvent>>;
}
```

## 7.3 Calendly Reality Note
Depending on implementation approach, the system may:
- create bookings directly via provider API
- or send booking links and wait for provider webhook confirmation

For MVP, either is acceptable, but the **shared booking service must not assume both exist**.
Design the adapter methods as optional where provider capability may differ.

## 7.4 What Belongs in Calendly Adapter
- event type URI handling
- webhook verification
- booking payload translation
- provider callback normalization

---

# 8. AI Provider Adapter

## 8.1 Responsibilities
AI adapters are responsible for:
- generating structured decisions
- generating reply text
- returning raw provider responses for audit
- classifying provider-level failures
- optionally exposing token/model metadata

The first implementation may be `OpenAIAdapter`.
Second implementation may be `AnthropicAdapter`.

## 8.2 Core Design Principle
The AI adapter should produce **structured results**, not only free text.

The shared AI service should build prompt context and validate output shape.
The adapter should focus on provider invocation and response extraction.

## 8.3 Interface
```ts
type AIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type AIDecisionRequest = {
  model?: string | null;
  messages: AIMessage[];
  expectedSchemaName: string;
  temperature?: number | null;
  metadata?: Record<string, unknown>;
};

type StructuredDecision = {
  should_reply: boolean;
  reply_text?: string | null;
  qualification_state?: string | null;
  should_book?: boolean | null;
  recommended_calendar_id?: string | null;
  escalate_to_human?: boolean | null;
  tags_to_emit?: string[];
  confidence_notes?: string[];
  reason_summary?: string | null;
};

type AIDecisionResult = {
  modelName?: string | null;
  structuredDecision: StructuredDecision;
  usage?: {
    inputTokens?: number | null;
    outputTokens?: number | null;
  };
};

interface AIProviderAdapter {
  healthCheck(): Promise<AdapterResult<HealthCheckResult>>;
  generateStructuredDecision(
    input: AIDecisionRequest
  ): Promise<AdapterResult<AIDecisionResult>>;
}
```

## 8.4 What Belongs in AI Adapter
- provider SDK/API call
- response parsing
- JSON/tool-mode extraction
- provider error classification
- usage/token extraction if available

## 8.5 What Must Not Leak Out
Shared services must not depend on:
- OpenAI-specific response fields
- Anthropic-specific block structures
- provider-specific terminology for tools/functions

## 8.6 OpenAI vs Anthropic Guidance
The shared AI service should be able to use either adapter.
Differences in provider behavior should be hidden behind:
- normalized request assembly
- normalized decision result
- provider-specific parsing inside adapter

---

# 9. Adapter Factory Pattern

## 9.1 Why a Factory
The application should resolve adapters from integration records, not instantiate providers ad hoc throughout the codebase.

## 9.2 Example Factory Shape
```ts
interface AdapterFactory {
  getSMSAdapter(integrationId: string): Promise<SMSAdapter>;
  getCRMAdapter(integrationId: string): Promise<CRMAdapter>;
  getCalendarAdapter(integrationId: string): Promise<CalendarAdapter>;
  getAIProviderAdapter(integrationId: string): Promise<AIProviderAdapter>;
}
```

## 9.3 Resolution Rules
Factory should:
1. load integration row
2. validate integration belongs to workspace where relevant
3. load secrets from secret storage
4. instantiate correct adapter class
5. throw/return explicit error for unsupported provider

---

# 10. Service-to-Adapter Boundaries

## 10.1 Messaging Service -> SMS Adapter
Messaging service should:
- decide *whether* to send
- enforce business hours
- generate idempotency key
- persist message state

SMS adapter should:
- perform provider call
- normalize provider result

## 10.2 CRM Service -> CRM Adapter
CRM service should:
- decide *which* CRM event to emit
- select integration
- log normalized request/result
- manage retries

CRM adapter should:
- perform provider API call
- normalize success/failure

## 10.3 Booking Service -> Calendar Adapter
Booking service should:
- decide *whether* booking is allowed
- validate calendar assignment/eligibility
- decide fallback behavior

Calendar adapter should:
- perform provider booking or parse provider callbacks
- normalize provider results

## 10.4 AI Service -> AI Provider Adapter
AI service should:
- assemble transcript/context
- create prompt
- define expected schema
- validate decision object after adapter returns

AI adapter should:
- call provider
- extract structured response
- return normalized usage/raw data

---

# 11. Error Handling and Retry Classification

## 11.1 Adapter Error Contract
Every adapter call should return enough info to decide:
- success/failure
- retryable/non-retryable
- provider error code if known
- raw payload for audit

## 11.2 Retryable Examples
Usually retryable:
- network timeout
- 429/rate limit
- transient 5xx provider errors

Usually non-retryable:
- invalid credentials
- invalid phone number format
- unsupported tag/calendar ID
- schema validation failure in our own request

## 11.3 Recommendation
Use provider-specific mapping inside adapter to normalize into:
- `retryable = true/false`
- `errorCode`
- `errorMessage`

---

# 12. Healthchecks

## 12.1 Requirement
Every adapter should support a lightweight healthcheck.

## 12.2 Healthcheck Goals
- verify credentials/config are usable
- avoid destructive side effects
- provide helpful error message for UI/admin

## 12.3 Example Meanings
- SMS adapter: can authenticate and account is accessible
- CRM adapter: can authenticate and reach base API
- Calendar adapter: can authenticate and verify at least one known calendar
- AI adapter: can perform lightweight test request or validate model access

---

# 13. Logging and Observability

## 13.1 Adapter Logging Rules
Adapters should not silently swallow provider issues.

At minimum, higher-level services should persist:
- normalized request intent
- normalized result
- provider reference IDs
- retryability classification
- raw payload/response where appropriate

## 13.2 Sensitive Data Rule
Do not log secrets.
Redact:
- API keys
- bearer tokens
- signing secrets
- sensitive contact data when unnecessary

---

# 14. Mock Adapters for Local Development

## 14.1 Why Mocks Matter
AI coding agents and engineers should be able to develop flows without depending on live providers every time.

## 14.2 Recommended Mock Adapters
Create mock implementations for:
- `MockSMSAdapter`
- `MockCRMAdapter`
- `MockCalendarAdapter`
- `MockAIProviderAdapter`

## 14.3 Mock Behavior Goals
Mocks should:
- return deterministic outputs
- simulate retryable and non-retryable failures
- support fixture-based transcript tests
- make integration tests predictable

---

# 15. Provider Capability Notes

## 15.1 Capability Mismatch Is Normal
Not every provider will support the same operations.

Examples:
- some calendar providers may support direct booking; others may only provide booking links
- some CRMs may support tags and notes; others may use labels/custom events
- some AI providers may support JSON mode better than others

## 15.2 Design Rule
Represent capability mismatch explicitly:
- optional interface methods where necessary
- provider capability metadata if helpful
- shared services must branch intentionally, not accidentally

---

# 16. Recommended Folder Structure

```text
/src/lib/integrations
  /types
    adapters.ts
    shared.ts
  /factory
    adapter-factory.ts
  /sms
    sms-adapter.ts
    twilio-sms-adapter.ts
    mock-sms-adapter.ts
  /crm
    crm-adapter.ts
    keap-crm-adapter.ts
    mock-crm-adapter.ts
  /calendar
    calendar-adapter.ts
    calendly-calendar-adapter.ts
    mock-calendar-adapter.ts
  /ai
    ai-provider-adapter.ts
    openai-adapter.ts
    anthropic-adapter.ts
    mock-ai-adapter.ts
```

---

# 17. Example End-to-End Flow Through Adapters

## 17.1 Outbound AI Reply
1. Conversation service determines AI should reply
2. AI service assembles transcript + agent version prompt
3. AI service calls `AIProviderAdapter.generateStructuredDecision()`
4. AI service validates structured decision
5. Booking service validates calendar recommendation if any
6. Messaging service decides reply can be sent
7. Messaging service calls `SMSAdapter.sendMessage()`
8. CRM service later emits normalized outcome event via `CRMAdapter`

## 17.2 Human Takeover
No adapter should be needed merely to change conversation control state.
That belongs in shared application services.
Only manual message delivery should use the SMS adapter.

---

# 18. Anti-Patterns to Avoid

AI coding agents and engineers must avoid:

1. **Calling provider SDKs directly from route handlers**
2. **Embedding provider request field names in shared domain services**
3. **Letting adapters mutate conversation state directly**
4. **Mixing prompt construction into provider adapter implementation**
5. **Hardcoding one provider per product domain forever**
6. **Returning raw provider objects as public contract**
7. **Skipping healthcheck support**
8. **Ignoring retry classification**

---

# 19. Minimum Implementation Order

Build adapters in this order:

1. shared adapter types/interfaces
2. adapter factory
3. Twilio SMS adapter
4. OpenAI adapter
5. Keap CRM adapter
6. Calendly adapter
7. mock adapters
8. integration tests per adapter

This order supports fastest MVP path.

---

# 20. Summary for AI Coding Agents

Implement provider integrations behind strict adapter interfaces.

Rules:
- normalize inputs/outputs
- keep provider SDK logic isolated
- preserve raw provider data for audit
- classify retryable vs non-retryable failures
- expose healthchecks
- do not leak provider-specific concepts into shared orchestration code

The adapter layer is one of the most important long-term architecture boundaries in this project.
