-- Campaign-level calendar assignments (replaces per-agent assignments)
create table if not exists campaign_calendars (
  id          uuid primary key default extensions.uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  calendar_id uuid not null references calendars(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique(campaign_id, calendar_id)
);

create index if not exists idx_campaign_calendars_campaign
  on campaign_calendars(campaign_id);

create index if not exists idx_campaign_calendars_workspace
  on campaign_calendars(workspace_id);

-- RLS (service-role bypasses; add user policies as needed)
alter table campaign_calendars enable row level security;
