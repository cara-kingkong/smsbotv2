-- ============================================================
-- Kong SMS — Workspace Phone Numbers
-- ============================================================
-- Inventory of Twilio phone numbers per workspace. Outbound SMS
-- selects a number whose country_code matches the lead's E.164
-- country, falling back to the workspace's is_default number.
-- Inbound webhooks can pin the owning workspace via `To`.

create table workspace_phone_numbers (
  id            uuid primary key default extensions.uuid_generate_v4(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  e164          text not null,
  country_code  text not null check (country_code ~ '^[A-Z]{2}$'),
  label         text not null default '',
  is_default    boolean not null default false,
  provider      text not null default 'twilio',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Twilio numbers are globally unique in E.164; enforce it.
create unique index idx_workspace_phone_numbers_e164
  on workspace_phone_numbers(e164);

create index idx_workspace_phone_numbers_workspace
  on workspace_phone_numbers(workspace_id);

create index idx_workspace_phone_numbers_workspace_country
  on workspace_phone_numbers(workspace_id, country_code);

-- At most one default per workspace.
create unique index idx_workspace_phone_numbers_default
  on workspace_phone_numbers(workspace_id)
  where is_default = true;

alter table workspace_phone_numbers enable row level security;

create policy "workspace_phone_numbers_workspace" on workspace_phone_numbers
  for select using (
    workspace_id in (
      select workspace_id from workspace_users where user_id = auth.uid()
    )
  );

create trigger trg_workspace_phone_numbers_updated_at
  before update on workspace_phone_numbers
  for each row execute function set_updated_at();

comment on table workspace_phone_numbers is
  'Twilio phone numbers owned by a workspace. Outbound routing picks a number whose country_code matches the lead''s E.164 country; falls back to is_default.';
