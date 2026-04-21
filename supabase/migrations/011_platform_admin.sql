-- ============================================================
-- Platform admin flag
-- ============================================================
-- Platform admins can create/delete/rename workspaces and manage
-- membership (add/remove/change role) across every workspace.
-- This flag is intentionally API-gated only; service-role clients
-- always bypass RLS.
--
-- Bootstrap: after applying, promote the first admin manually:
--   update users set is_platform_admin = true where email = 'you@example.com';

alter table users
  add column if not exists is_platform_admin boolean not null default false;

create index if not exists idx_users_platform_admin
  on users(is_platform_admin)
  where is_platform_admin = true;
