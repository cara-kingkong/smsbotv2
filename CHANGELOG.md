# Changelog

All notable changes to Kong SMS are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); dates are ISO (YYYY-MM-DD).

## [2026-07-07]

### Added

- **"Mark as booked" button for human-controlled conversations.** When an
  operator takes a thread over and books the lead out-of-band (e.g. on a call),
  they can now record the outcome directly from the Inbox. The button records
  the `booked` outcome **only** — it runs no booking automation: no Calendly
  hold, no CRM sync, no confirmation SMS — and deliberately leaves the
  conversation status untouched, so the thread stays open and human-controlled
  and the operator can keep replying. The label is reversible (it's an outcome
  tag, not a terminal transition), so a mis-click can be corrected. The button
  shows only while a conversation is human-controlled and not already booked;
  once set, the emerald `booked` badge appears and the button hides itself. Each
  use logs a `booking_marked_manual` event (`source: manual_operator`) so a
  manual booking is distinguishable from an automated one in the Inbox
  Diagnostics booking trace, and the dashboard "booked" metric picks it up via
  the outcome. Manager role required; terminal (completed / opted-out / failed)
  threads are rejected so a closed outcome is never relabelled.
  - Files: `netlify/functions/api-inbox-mark-booked.ts`,
    `src/pages/api/[...fn].ts`, `src/lib/conversations/service.ts`,
    `src/lib/types/enums.ts`, `src/components/ConversationInbox.vue`.

### Fixed

- **Qualified leads who volunteer a time unprompted no longer stall silently.**
  A qualified lead who proposed a time in reply to a non-scheduling question
  ("I can do 3pm tomorrow for a phone chat" straight after "what's your ballpark
  monthly revenue?") could be parked `waiting for lead` forever. The model
  returned `should_reply: false` with no booking flags, the orchestrator
  classified the turn as intentional silence, and the deterministic acceptance
  fallback couldn't rescue it — `detectBookingAcceptance` only inferred
  acceptance from the *previous outbound's* scheduling context, so a time the
  lead volunteered when the prior AI message had no scheduling keywords was
  invisible. Now:
  - `detectBookingAcceptance` gains an **inbound self-proposal path**: it fires
    when the lead's own message carries a time reference plus either proposal
    framing ("I can do…", "how about…", "I'm free…", "does X work") or a
    scheduling noun (call / meeting / "phone chat"), with no reliance on the
    prior outbound.
  - A negation guard suppresses it on negated availability ("I can't do 3pm
    tomorrow", "tomorrow doesn't work") so a decline never books.
  - `SCHEDULING_CONTEXT_RE` now accepts one meeting-ish modifier before "chat"
    ("a phone / video / zoom chat") without tripping on casual "a great chat".
  - New evidence keys (`inbound_self_proposed_time`, `inbound_scheduling_context`)
    distinguish this rescue path from the classic offered-slot acceptance in the
    `booking_acceptance_detected` / `booking_blocked_unqualified` diagnostics.
    The rescue remains gated by the existing qualified + calendars checks, so an
    unqualified lead is still blocked.
  - Files: `src/lib/utils/booking-guard.ts`.

## [2026-06-19]

### Fixed

- **Qualified leads no longer stall on booking after the AI says "I'll get you
  booked in".** A qualified lead who agreed to a call would be parked
  `waiting for lead` forever — the AI narrated the booking in prose ("Great!
  I'll get you booked in now") but left `should_offer_times`/`should_book`
  false, so the slot-offer machinery never ran and no times were ever sent.
  Observed on multiple threads showing "qualified not booked" with **no booking
  events logged**. The deterministic acceptance fallback couldn't rescue these:
  it required either an explicit acceptance phrase or an affirmative paired with
  a concrete time — but bare yeses ("Yes", "Ok") and offers framed as a
  "strategy session" (not a tracked scheduling keyword) slipped through. Now:
  - New `detectBookingPromise()` recognises when the AI's *own reply commits* to
    booking ("get you booked in", "lock in a time") and forces a slot offer when
    no booking flag was set — the one signal present in every stall regardless
    of how the lead phrased their yes. Interrogative offers ("want me to book you
    in?") and negated commitments ("I can't lock you in until…") are excluded so
    times are never offered before the lead agrees.
  - The rescue is gated by the same qualified + calendars-present checks as every
    other booking pathway; an unqualified rescue is stripped back by the
    qualification gate and recorded as such (`blocked_unqualified`).
  - `SCHEDULING_CONTEXT_RE` now recognises `session` and `catch-up` so the
    acceptance fallback fires for those offer framings too. `chat` only counts
    when qualified as a meeting ("a quick chat") to avoid tripping on casual SMS
    ("thanks for the chat").
  - Each rescue emits a `booking_promise_rescued` event (visible in the Inbox
    Diagnostics panel) so the failure mode is observable if it recurs.
  - Files: `netlify/functions/process-ai-reply-background.ts`,
    `src/lib/utils/booking-guard.ts`, `src/lib/types/enums.ts`,
    `src/components/ConversationDiagnosticsPanel.vue`.

## [2026-06-18]

### Fixed

- **Booked leads no longer get re-offered times or have their slot rebooked.**
  A booked conversation (status Completed, outcome Booked) wasn't in the inbound
  webhook's "active" set, so a follow-up reply like "Yes" fell into the re-open
  branch, which force-reactivated it and fed it back to the AI — which
  re-offered times. Worse, a time reply could cancel and rebook their confirmed
  slot. The availability pre-check now runs **ahead of** the prior-booking
  cancellation, so a bad rebook can no longer destroy a confirmed slot.

- **No more booking times Calendly never offered (the 400 loop).** Calendly's
  booking call only accepts a `start_time` that exactly matches a currently
  available slot. Two paths violated this: a lead self-proposing a time
  ("tomorrow 11:30am AWST") that the model turned into a timestamp, and the
  deterministic acceptance fallback enqueuing a booking with no `confirmed_time`
  — which defaulted to "now". Either way Calendly returned a 400, burning every
  retry and dead-lettering the job. Now:
  - `confirmed_time` is validated against real availability before booking; on a
    miss the lead is offered real slots to pick from instead of a blind POST.
  - The "now" fallback is gone — the acceptance path offers slots, or hands to a
    human when there are none.
  - A second availability pre-check in `process-booking` acts as a backstop for
    any other enqueue path and for stale times.
  - `matchAvailableSlot` snaps a requested time to the slot's canonical ISO
    (minute precision, timezone-agnostic) so the POST matches exactly.
  - `AVAILABILITY_WINDOW_DAYS` (14) is shared between offering and validation so
    the two horizons can't drift; a self-proposed time beyond it degrades to an
    offer of nearer slots rather than a failure.
  - Files: `netlify/functions/process-ai-reply-background.ts`,
    `netlify/functions/process-booking-background.ts`,
    `src/lib/utils/booking-guard.ts`.

- **Both no-slot failure paths now notify the team.** The "requested time
  unavailable" and "no available slots" branches enqueue an escalation
  notification instead of only surfacing in the Needs Human inbox.
  (`netlify/functions/process-booking-background.ts`,
  `src/lib/utils/escalation-notify.ts`)

- **Full Calendly error body surfaced in diagnostics.** Calendly 4xx responses
  are parsed into a concise front-loaded summary (`title — message — [param:
  detail]`) so the cause survives log/panel truncation, instead of a raw blob
  that cut off mid-message. (`src/lib/calendar/adapters/calendly.ts`)

### Added

- **Lead timezone detection (fixes AWST/Perth mis-times).** When a lead reveals
  where they are ("I'm in Brisbane", "11:30am AWST"), the AI resolves it to an
  IANA zone (`detected_timezone`), which is validated as a real zone before
  being persisted to the lead and applied the same turn. From then on slot
  offers, business-hours filtering, booking, and confirmations all happen in the
  customer's local time — a Perth lead sees "Perth time", not a hardcoded
  "Melbourne time". Invalid/hallucinated values are dropped to null and never
  persisted; the change is recorded as a `lead_timezone_updated` event.
  - Files: `src/lib/ai/service.ts`, `src/lib/ai/adapters/{anthropic,openai}.ts`,
    `src/lib/leads/service.ts`, `src/lib/utils/timezones.ts`,
    `src/lib/types/domain.ts`,
    `netlify/functions/{process-ai-reply,process-booking}-background.ts`.

### Changed

- **Booking conversation events moved onto the `ConversationEventType` enum.**
  Booking/slots/timezone events that were raw string literals now reference the
  enum. String values are unchanged, so historical rows and the prior-booking
  cancellation query (which filters by `booking_reference`) still match.
  (`src/lib/types/enums.ts`,
  `netlify/functions/{process-ai-reply,process-booking}-background.ts`)

## [2026-06-10]

### Fixed

- **Auth: users no longer logged out early.** Sessions were ending well under
  the intended 7-day window. The browser Supabase client auto-refreshed (and
  rotated) the refresh token in `localStorage` while the server cookie still
  held the old token; with refresh-token rotation enabled on the hosted
  project, the stale cookie token was invalidated within seconds and the next
  server-side refresh redirected the user to `/login`. Cookies are now the
  single source of truth — `persistSession` and `autoRefreshToken` are disabled
  on every Supabase client, and the middleware is the only place that rotates
  tokens (writing the new token straight back to the cookie).
  - Files: `src/lib/db/client.ts`, `src/pages/login.astro`,
    `src/pages/auth/callback.astro`.

## [2026-06-09]

### Added

- **Qualification gate before booking (defense in depth).** Booking can no
  longer happen until the AI has explicitly assessed a lead as `qualified` —
  on the current turn or any earlier turn in the conversation (qualification is
  sticky once reached). The gate sits in front of all three booking pathways:
  the AI offering times (`should_offer_times`), the AI confirming a booking
  (`should_book`), and the deterministic "acceptance" fallback. Previously the
  qualification rules lived only in the agent prompt and were never enforced in
  code, so a lead could be booked without being qualified.
  - When a booking is attempted too early, the system blocks it, logs a
    `booking_blocked_unqualified` conversation event, and re-asks the model for
    a reply that keeps qualifying instead of sending a premature "I'll book you
    in" message. Booking flags are hard-stripped for that turn so nothing books
    even if the model insists.
  - New `BOOKING_BLOCKED_NOTE` prompt instruction and `booking_blocked` prompt
    context flag steer the regenerated reply back into qualification.
  - Files: `netlify/functions/process-ai-reply-background.ts`,
    `src/lib/utils/booking-guard.ts`, `src/lib/ai/service.ts`,
    `src/lib/ai/adapters/{openai,anthropic}.ts`, `src/lib/types/adapters.ts`.

- **Engaged-conversation tracking.** New denormalized `has_lead_reply` flag on
  `conversations`, maintained by the existing last-message insert trigger and
  backfilled for historical threads. Lets the dashboard report conversations
  where the lead actually replied without scanning the messages table.
  (`supabase/migrations/017_conversation_lead_reply.sql`)

- **Server-side dashboard metrics.** New `workspace_conversation_metrics(uuid)`
  SQL function returns one pre-aggregated row per (campaign, agent) with status
  and outcome buckets. (`supabase/migrations/018_workspace_conversation_metrics.sql`)

### Changed

- **Reporting service now aggregates in the database.** The dashboard used to
  fetch every conversation row and tally them in the app, which silently
  undercounted any workspace with more than 1000 conversations (PostgREST's
  `max_rows` cap). It now calls `workspace_conversation_metrics`, removing the
  cap and shipping a handful of rows instead of thousands.
  (`src/lib/reporting/service.ts`, `src/components/DashboardView.vue`,
  `src/components/CampaignDetail.vue`)

- Documented the `has_lead_reply` column in `docs/database-schema.md`.

- **Deliberate AI silence closes the loop instead of escalating.** When the AI
  decides there is nothing worth replying to and is neither escalating nor
  booking, the conversation now resolves quietly rather than being flagged for
  a human. Leads the AI has assessed as `unqualified` close as **Completed**
  (the `unqualified` outcome was already recorded); everyone else (sign-offs,
  acknowledgements) stays **Waiting for lead** so they can re-engage. The
  "team is reviewing" hand-off SMS is now reserved for genuine no-action
  failures (e.g. the AI wanted to reply but produced no text).
  (`netlify/functions/process-ai-reply-background.ts`)

- **No-action failures escalate via webhook, not a robotic SMS.** When the AI
  genuinely can't act on an inbound message, the thread no longer texts the
  lead the canned "A team member is reviewing the next step…" line. It now
  notifies the team out-of-band via the escalation webhook
  (`notify_escalation`, reason `ai_no_action`) and only sends the lead a warm
  holding line when they have actually engaged (`lastInbound` present) — cold
  threads stay silent so the human persona isn't broken. This brings the
  no-action path in line with the other escalation paths (AI escalation,
  booking-needs-human). (`netlify/functions/process-ai-reply-background.ts`)

### Fixed

- **No more canned "team member is reviewing" reply on conversational
  sign-offs.** The silent-skip behaviour introduced for emoji reactions /
  tapbacks only matched reactions, so plain-text sign-offs like "sweet" or
  "Will do!" still fell through to the generic no-action branch — which sent
  the "A team member is reviewing the next step and will follow up shortly."
  SMS and marked the thread `needs_human`, even though the AI had correctly
  decided there was nothing left to say. The silence branch now covers any
  deliberate no-reply decision (`should_reply = false`, not escalating, not
  booking), regardless of whether the last inbound was a reaction.
  - Reaction threads keep the richer `ai_skipped_reaction` event; the new
    plain-text case logs `ai_skipped_no_reply` for diagnostics.
  - File: `netlify/functions/process-ai-reply-background.ts`.

- **Opt-out requests with extra words are now honoured.** Inbound opt-out
  detection only matched when the *entire* message was a single keyword, so
  "Unsubscribe - sold business", "STOP texting me", and similar slipped through
  — the lead was never marked opted out, the conversation stayed `active`, and
  the AI kept replying (a TCPA/compliance risk). Detection now also matches when
  a message leads with an opt-out keyword (`stop`, `unsubscribe`, `quit`, `end`)
  or contains the unambiguous word "unsubscribe" anywhere.
  - Biased toward honouring opt-outs, but ambiguous keywords are not matched
    mid-sentence, so "the end of the day", "I quit my job", and "don't stop"
    keep the conversation active. Inflections ("ending", "stopper") and
    "cancel" (booking cancellation) are excluded.
  - Extracted into a tested `isOptOut` helper.
    Files: `src/lib/utils/opt-out.ts`, `tests/lib/utils/opt-out.test.ts`,
    `netlify/functions/webhook-twilio-inbound.ts`.
