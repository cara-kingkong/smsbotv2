-- ============================================================
-- Kong SMS — Debug / test conversations
-- ============================================================
-- Adds an `is_test` flag to leads and conversations so the
-- in-app debug chat can exercise the full AI / booking / CRM
-- pipeline without going through Twilio. The flag is also used
-- to filter test rows out of the inbox and reporting metrics.

alter table leads
  add column if not exists is_test boolean not null default false;

alter table conversations
  add column if not exists is_test boolean not null default false;

create index if not exists idx_leads_workspace_is_test
  on leads(workspace_id)
  where is_test = true;

create index if not exists idx_conversations_workspace_is_test
  on conversations(workspace_id)
  where is_test = true;
