-- ============================================================
-- AI Decisions table — structured AI output storage
-- ============================================================

create table ai_decisions (
  id                      uuid primary key default extensions.uuid_generate_v4(),
  workspace_id            uuid not null references workspaces(id) on delete cascade,
  conversation_id         uuid not null references conversations(id) on delete cascade,
  message_id              uuid references messages(id),
  agent_version_id        uuid not null references agent_versions(id),
  provider_integration_id uuid references integrations(id),
  model_name              text,
  input_json              jsonb not null default '{}',
  decision_json           jsonb not null default '{}',
  raw_response_json       jsonb not null default '{}',
  created_at              timestamptz not null default now()
);

create index idx_ai_decisions_workspace on ai_decisions(workspace_id);
create index idx_ai_decisions_conversation on ai_decisions(conversation_id);
create index idx_ai_decisions_agent_version on ai_decisions(agent_version_id);

-- Enable RLS
alter table ai_decisions enable row level security;

-- Workspace-scoped read policy
create policy "ai_decisions_workspace" on ai_decisions
  for select using (
    workspace_id in (select workspace_id from workspace_users where user_id = auth.uid())
  );

-- Enable realtime for AI decisions (useful for inbox)
alter publication supabase_realtime add table ai_decisions;
