-- ============================================================
-- Kong SMS Chatbot — Foundation Schema
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp" schema extensions;
create extension if not exists "pgcrypto" schema extensions;

-- ─── Custom Types ────────────────────────────────────────────

create type entity_status as enum ('active', 'paused', 'archived', 'deleted');
create type workspace_role as enum ('owner', 'admin', 'manager', 'read_only');
create type integration_type as enum ('crm', 'calendar', 'sms', 'ai_provider');
create type integration_provider as enum ('twilio', 'calendly', 'keap', 'openai', 'anthropic');
create type conversation_status as enum (
  'queued', 'active', 'waiting_for_lead', 'paused_business_hours',
  'paused_manual', 'needs_human', 'human_controlled',
  'completed', 'opted_out', 'failed'
);
create type conversation_outcome as enum (
  'booked', 'qualified_not_booked', 'unqualified',
  'no_response', 'opted_out', 'human_takeover', 'other'
);
create type message_direction as enum ('inbound', 'outbound');
create type sender_type as enum ('lead', 'ai', 'human', 'system');
create type job_status as enum ('pending', 'running', 'completed', 'failed', 'dead_lettered');
create type crm_sync_status as enum ('pending', 'sent', 'failed', 'retrying');

-- ─── Workspaces ──────────────────────────────────────────────

create table workspaces (
  id          uuid primary key default extensions.uuid_generate_v4(),
  name        text not null,
  slug        text not null unique,
  status      entity_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- ─── Users (mirrors Supabase auth.users) ─────────────────────

create table users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null unique,
  full_name     text not null default '',
  auth_provider text not null default 'google',
  created_at    timestamptz not null default now()
);

-- ─── Workspace Membership ────────────────────────────────────

create table workspace_users (
  id            uuid primary key default extensions.uuid_generate_v4(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  user_id       uuid not null references users(id) on delete cascade,
  role          workspace_role not null default 'admin',
  created_at    timestamptz not null default now(),
  unique(workspace_id, user_id)
);

-- ─── Integrations ────────────────────────────────────────────

create table integrations (
  id            uuid primary key default extensions.uuid_generate_v4(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  type          integration_type not null,
  provider      integration_provider not null,
  name          text not null,
  status        entity_status not null default 'active',
  config_json   jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_integrations_workspace on integrations(workspace_id);

-- ─── Campaigns ───────────────────────────────────────────────

create table campaigns (
  id                    uuid primary key default extensions.uuid_generate_v4(),
  workspace_id          uuid not null references workspaces(id) on delete cascade,
  name                  text not null,
  status                entity_status not null default 'active',
  business_hours_json   jsonb not null default '{}',
  stop_conditions_json  jsonb not null default '{"max_messages": 50, "max_days": 14, "max_no_reply_hours": 72}',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

create index idx_campaigns_workspace on campaigns(workspace_id);

-- ─── Agents ──────────────────────────────────────────────────

create table agents (
  id                          uuid primary key default extensions.uuid_generate_v4(),
  campaign_id                 uuid not null references campaigns(id) on delete cascade,
  name                        text not null,
  status                      entity_status not null default 'active',
  ai_provider_integration_id  uuid references integrations(id),
  weight                      integer not null default 1,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  deleted_at                  timestamptz
);

create index idx_agents_campaign on agents(campaign_id);

-- ─── Agent Versions ──────────────────────────────────────────

create table agent_versions (
  id                uuid primary key default extensions.uuid_generate_v4(),
  agent_id          uuid not null references agents(id) on delete cascade,
  version_number    integer not null,
  prompt_text       text not null default '',
  system_rules_json jsonb not null default '{}',
  reply_cadence_json jsonb not null default '{"initial_delay_seconds": 30, "followup_delay_seconds": 3600, "max_followups": 5}',
  config_json       jsonb not null default '{}',
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  unique(agent_id, version_number)
);

create index idx_agent_versions_agent on agent_versions(agent_id);

-- ─── Calendars ───────────────────────────────────────────────

create table calendars (
  id                      uuid primary key default extensions.uuid_generate_v4(),
  workspace_id            uuid not null references workspaces(id) on delete cascade,
  integration_id          uuid not null references integrations(id) on delete cascade,
  name                    text not null,
  booking_url             text not null default '',
  eligibility_rules_json  jsonb not null default '{}',
  status                  entity_status not null default 'active',
  created_at              timestamptz not null default now()
);

create index idx_calendars_workspace on calendars(workspace_id);

-- ─── Agent ↔ Calendar ────────────────────────────────────────

create table agent_calendars (
  id          uuid primary key default extensions.uuid_generate_v4(),
  agent_id    uuid not null references agents(id) on delete cascade,
  calendar_id uuid not null references calendars(id) on delete cascade,
  unique(agent_id, calendar_id)
);

-- ─── Leads ───────────────────────────────────────────────────

create table leads (
  id                    uuid primary key default extensions.uuid_generate_v4(),
  workspace_id          uuid not null references workspaces(id) on delete cascade,
  external_contact_id   text,
  crm_provider          text,
  first_name            text not null default '',
  last_name             text not null default '',
  email                 text,
  phone_e164            text not null,
  timezone              text,
  status                entity_status not null default 'active',
  opted_out             boolean not null default false,
  source_json           jsonb not null default '{}',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_leads_workspace on leads(workspace_id);
create index idx_leads_phone on leads(workspace_id, phone_e164);

-- ─── Conversations ───────────────────────────────────────────

create table conversations (
  id                uuid primary key default extensions.uuid_generate_v4(),
  workspace_id      uuid not null references workspaces(id) on delete cascade,
  campaign_id       uuid not null references campaigns(id),
  agent_id          uuid not null references agents(id),
  agent_version_id  uuid not null references agent_versions(id),
  lead_id           uuid not null references leads(id),
  status            conversation_status not null default 'queued',
  outcome           conversation_outcome,
  needs_human       boolean not null default false,
  human_controlled  boolean not null default false,
  opened_at         timestamptz not null default now(),
  last_activity_at  timestamptz not null default now(),
  paused_until      timestamptz,
  closed_at         timestamptz,
  deleted_at        timestamptz
);

create index idx_conversations_workspace on conversations(workspace_id);
create index idx_conversations_campaign on conversations(campaign_id);
create index idx_conversations_lead on conversations(lead_id);
create index idx_conversations_status on conversations(workspace_id, status);

-- ─── Messages ────────────────────────────────────────────────

create table messages (
  id                  uuid primary key default extensions.uuid_generate_v4(),
  conversation_id     uuid not null references conversations(id) on delete cascade,
  direction           message_direction not null,
  sender_type         sender_type not null,
  body_text           text not null default '',
  provider_message_id text,
  provider_status     text,
  error_json          jsonb,
  sent_at             timestamptz,
  received_at         timestamptz,
  created_at          timestamptz not null default now()
);

create index idx_messages_conversation on messages(conversation_id);

-- ─── Conversation Events ─────────────────────────────────────

create table conversation_events (
  id                  uuid primary key default extensions.uuid_generate_v4(),
  conversation_id     uuid not null references conversations(id) on delete cascade,
  event_type          text not null,
  event_payload_json  jsonb not null default '{}',
  created_at          timestamptz not null default now()
);

create index idx_conversation_events_conversation on conversation_events(conversation_id);

-- ─── CRM Events ──────────────────────────────────────────────

create table crm_events (
  id                    uuid primary key default extensions.uuid_generate_v4(),
  workspace_id          uuid not null references workspaces(id) on delete cascade,
  conversation_id       uuid not null references conversations(id),
  integration_id        uuid not null references integrations(id),
  event_type            text not null,
  status                crm_sync_status not null default 'pending',
  request_payload_json  jsonb not null default '{}',
  response_payload_json jsonb,
  retry_count           integer not null default 0,
  created_at            timestamptz not null default now()
);

create index idx_crm_events_workspace on crm_events(workspace_id);
create index idx_crm_events_status on crm_events(status);

-- ─── Webhook Receipts ────────────────────────────────────────

create table webhook_receipts (
  id                uuid primary key default extensions.uuid_generate_v4(),
  workspace_id      uuid not null references workspaces(id) on delete cascade,
  source_type       text not null,
  source_identifier text not null default '',
  idempotency_key   text not null,
  payload_json      jsonb not null default '{}',
  processed_status  text not null default 'received',
  created_at        timestamptz not null default now()
);

create unique index idx_webhook_receipts_idempotency on webhook_receipts(workspace_id, idempotency_key);

-- ─── Jobs (Queue) ────────────────────────────────────────────

create table jobs (
  id              uuid primary key default extensions.uuid_generate_v4(),
  job_type        text not null,
  queue_name      text not null default 'default',
  status          job_status not null default 'pending',
  payload_json    jsonb not null default '{}',
  attempts        integer not null default 0,
  max_attempts    integer not null default 3,
  run_at          timestamptz not null default now(),
  last_error      text,
  dead_lettered_at timestamptz,
  created_at      timestamptz not null default now()
);

create index idx_jobs_queue_status on jobs(queue_name, status, run_at);

-- ─── Activity Log ────────────────────────────────────────────

create table activity_logs (
  id            uuid primary key default extensions.uuid_generate_v4(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  user_id       uuid references users(id),
  entity_type   text not null,
  entity_id     uuid not null,
  action_type   text not null,
  metadata_json jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create index idx_activity_logs_workspace on activity_logs(workspace_id);
create index idx_activity_logs_entity on activity_logs(entity_type, entity_id);

-- ─── Row Level Security ──────────────────────────────────────

alter table workspaces enable row level security;
alter table users enable row level security;
alter table workspace_users enable row level security;
alter table integrations enable row level security;
alter table campaigns enable row level security;
alter table agents enable row level security;
alter table agent_versions enable row level security;
alter table calendars enable row level security;
alter table agent_calendars enable row level security;
alter table leads enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table conversation_events enable row level security;
alter table crm_events enable row level security;
alter table webhook_receipts enable row level security;
alter table jobs enable row level security;
alter table activity_logs enable row level security;

-- ─── RLS Policies (workspace-scoped access) ──────────────────

-- Users can see their own profile
create policy "users_own" on users
  for select using (id = auth.uid());

-- Users can see workspaces they belong to
create policy "workspaces_member" on workspaces
  for select using (
    id in (select workspace_id from workspace_users where user_id = auth.uid())
  );

-- Workspace users can see membership in their workspaces
create policy "workspace_users_member" on workspace_users
  for select using (
    workspace_id in (select workspace_id from workspace_users where user_id = auth.uid())
  );

-- Workspace-scoped read policies for all domain tables
create policy "integrations_workspace" on integrations
  for select using (
    workspace_id in (select workspace_id from workspace_users where user_id = auth.uid())
  );

create policy "campaigns_workspace" on campaigns
  for select using (
    workspace_id in (select workspace_id from workspace_users where user_id = auth.uid())
  );

create policy "leads_workspace" on leads
  for select using (
    workspace_id in (select workspace_id from workspace_users where user_id = auth.uid())
  );

create policy "conversations_workspace" on conversations
  for select using (
    workspace_id in (select workspace_id from workspace_users where user_id = auth.uid())
  );

create policy "messages_workspace" on messages
  for select using (
    conversation_id in (
      select id from conversations
      where workspace_id in (select workspace_id from workspace_users where user_id = auth.uid())
    )
  );

-- Service role bypasses RLS for background functions
-- (Supabase service_role key already bypasses RLS by default)

-- ─── Realtime ────────────────────────────────────────────────

-- Enable realtime for conversation-critical tables
alter publication supabase_realtime add table conversations;
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversation_events;

-- ─── Updated-at triggers ─────────────────────────────────────

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_workspaces_updated_at before update on workspaces
  for each row execute function set_updated_at();

create trigger trg_integrations_updated_at before update on integrations
  for each row execute function set_updated_at();

create trigger trg_campaigns_updated_at before update on campaigns
  for each row execute function set_updated_at();

create trigger trg_agents_updated_at before update on agents
  for each row execute function set_updated_at();

create trigger trg_leads_updated_at before update on leads
  for each row execute function set_updated_at();
