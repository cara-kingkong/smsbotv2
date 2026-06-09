# Changelog

All notable changes to Kong SMS are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); dates are ISO (YYYY-MM-DD).

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
