-- Add workspace_id and description to agents table
-- workspace_id enables direct workspace-scoped queries without joining campaigns

alter table agents
  add column if not exists workspace_id uuid references workspaces(id) on delete cascade,
  add column if not exists description text;

-- Backfill workspace_id from campaigns
update agents
  set workspace_id = campaigns.workspace_id
  from campaigns
  where agents.campaign_id = campaigns.id
    and agents.workspace_id is null;

-- Now make workspace_id NOT NULL after backfill
alter table agents
  alter column workspace_id set not null;

create index if not exists idx_agents_workspace on agents(workspace_id);

-- Add allowed_actions_json and qualification_rules_json to agent_versions
alter table agent_versions
  add column if not exists allowed_actions_json jsonb not null default '{"can_book": true, "can_escalate_to_human": true, "can_close_unqualified": false}',
  add column if not exists qualification_rules_json jsonb not null default '{"required_fields": []}';
