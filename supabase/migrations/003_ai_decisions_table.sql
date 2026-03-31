-- ============================================================
-- AI Decisions table — structured AI output storage
-- ============================================================

create table if not exists ai_decisions (
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

create index if not exists idx_ai_decisions_workspace on ai_decisions(workspace_id);
create index if not exists idx_ai_decisions_conversation on ai_decisions(conversation_id);
create index if not exists idx_ai_decisions_agent_version on ai_decisions(agent_version_id);

-- Enable RLS
alter table ai_decisions enable row level security;

-- Workspace-scoped read policy (idempotent: drop + create)
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'ai_decisions' and policyname = 'ai_decisions_workspace'
  ) then
    create policy "ai_decisions_workspace" on ai_decisions
      for select using (
        workspace_id in (select workspace_id from workspace_users where user_id = auth.uid())
      );
  end if;
end
$$;

-- Enable realtime for AI decisions (useful for inbox)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ai_decisions'
  ) then
    alter publication supabase_realtime add table ai_decisions;
  end if;
end
$$;
