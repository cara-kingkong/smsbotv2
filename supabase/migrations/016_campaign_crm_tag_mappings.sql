-- ============================================================
-- Kong SMS — Per-campaign CRM tag mappings
-- ============================================================
-- Each campaign maps the five CRM lifecycle events to provider-
-- specific tag IDs (e.g. Keap numeric tag IDs). Leaving an event
-- unmapped means "skip the tag apply" — the system still creates
-- a note. Stored as JSONB so the schema doesn't change when new
-- event types are added.
--
-- Keys correspond to CRMEventType values:
--   conversation_qualified | conversation_unqualified
--   conversation_needs_human | conversation_booked | conversation_opted_out

alter table campaigns
  add column if not exists crm_tag_mappings_json jsonb not null default '{}'::jsonb;
