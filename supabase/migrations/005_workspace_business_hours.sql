-- ============================================================
-- Add business_hours_json and stop_conditions_json to workspaces table
-- Campaigns inherit workspace defaults unless they define their own
-- ============================================================

alter table workspaces
  add column business_hours_json jsonb not null default '{}';

alter table workspaces
  add column stop_conditions_json jsonb not null default '{"max_messages": 50, "max_days": 14, "max_no_reply_hours": 72}';

comment on column workspaces.business_hours_json is
  'Default business hours for the workspace. Campaigns inherit these unless they define their own.';

comment on column workspaces.stop_conditions_json is
  'Default stop conditions for the workspace. Campaigns inherit these unless they define their own.';
