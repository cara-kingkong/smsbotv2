-- ============================================================
-- Auto-create user record + default workspace on signup
-- ============================================================

-- Function triggered after a new auth.users row is inserted.
-- Creates the public.users mirror row, a personal workspace,
-- and an owner membership entry — all in one transaction.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _workspace_id uuid;
  _display_name text;
  _slug text;
begin
  -- Derive a display name from metadata or email
  _display_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1)
  );

  -- Generate a unique slug from the email prefix + random suffix
  _slug := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9]', '-', 'gi'))
            || '-' || substr(extensions.uuid_generate_v4()::text, 1, 8);

  -- 1. Create the public.users mirror row
  insert into public.users (id, email, full_name, auth_provider)
  values (
    new.id,
    new.email,
    _display_name,
    coalesce(new.raw_app_meta_data ->> 'provider', 'google')
  )
  on conflict (id) do nothing;

  -- 2. Create a default personal workspace
  insert into public.workspaces (name, slug, status)
  values (_display_name || '''s Workspace', _slug, 'active')
  returning id into _workspace_id;

  -- 3. Add the user as owner of their workspace
  insert into public.workspace_users (workspace_id, user_id, role)
  values (_workspace_id, new.id, 'owner');

  return new;
end;
$$;

-- Trigger fires after each new signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
