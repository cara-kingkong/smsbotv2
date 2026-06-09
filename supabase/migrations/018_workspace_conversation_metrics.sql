-- ============================================================
-- Server-side aggregation for the workspace reporting dashboard
-- ============================================================
-- The dashboard previously fetched every conversation row for a
-- workspace and tallied them in the application. PostgREST caps
-- responses at `max_rows` (1000, see supabase/config.toml), so any
-- workspace with >1000 conversations was silently undercounted —
-- the dashboard showed far fewer conversations than the (correctly
-- scoped) campaign detail page.
--
-- This function does the counting in the database and returns one
-- pre-aggregated row per (campaign, agent). That removes the row
-- cap entirely and ships a handful of rows instead of thousands.
--
-- Status / outcome buckets mirror the constants in
-- src/lib/reporting/service.ts — keep them in sync.

create or replace function workspace_conversation_metrics(p_workspace_id uuid)
returns table (
  campaign_id          uuid,
  agent_id             uuid,
  total                bigint,
  engaged              bigint,
  active               bigint,
  booked               bigint,
  qualified_not_booked bigint,
  unqualified          bigint,
  no_response          bigint,
  opted_out            bigint,
  human_takeover       bigint
)
language sql
stable
as $$
  select
    c.campaign_id,
    c.agent_id,
    count(*)                                                              as total,
    count(*) filter (where c.has_lead_reply)                              as engaged,
    count(*) filter (where c.status in (
      'active', 'waiting_for_lead', 'needs_human', 'human_controlled'
    ))                                                                    as active,
    count(*) filter (where c.outcome = 'booked')                          as booked,
    count(*) filter (where c.outcome = 'qualified_not_booked')            as qualified_not_booked,
    count(*) filter (where c.outcome = 'unqualified')                     as unqualified,
    count(*) filter (where c.outcome = 'no_response')                     as no_response,
    count(*) filter (where c.outcome = 'opted_out')                       as opted_out,
    count(*) filter (where c.outcome = 'human_takeover')                  as human_takeover
  from conversations c
  where c.workspace_id = p_workspace_id
    and c.is_test = false
    and c.deleted_at is null
  group by c.campaign_id, c.agent_id;
$$;
