-- Add missing columns to calendars table per database-schema.md spec

alter table calendars
  add column if not exists external_calendar_id text,
  add column if not exists settings_json jsonb not null default '{}',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

-- Allow booking_url to be nullable (event types may not have one yet)
alter table calendars alter column booking_url drop not null;
alter table calendars alter column booking_url set default null;

-- Add workspace_id and created_at to agent_calendars for workspace isolation
alter table agent_calendars
  add column if not exists workspace_id uuid references workspaces(id) on delete cascade,
  add column if not exists created_at timestamptz not null default now();

-- Index for soft-delete filtering
create index if not exists idx_calendars_workspace_active
  on calendars(workspace_id, status) where deleted_at is null;

-- Index for agent_calendars workspace scoping
create index if not exists idx_agent_calendars_workspace
  on agent_calendars(workspace_id);
