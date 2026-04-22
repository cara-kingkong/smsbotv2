-- Consolidate coalesce_window_seconds + initial_delay_seconds into reply_delay_seconds.

-- Migrate existing rows: sum the old fields into reply_delay_seconds, then drop them.
update agent_versions
set reply_cadence_json = (
  reply_cadence_json
  - 'coalesce_window_seconds'
  - 'initial_delay_seconds'
) || jsonb_build_object(
  'reply_delay_seconds',
  coalesce((reply_cadence_json->>'coalesce_window_seconds')::int, 0)
  + coalesce((reply_cadence_json->>'initial_delay_seconds')::int, 30)
)
where reply_cadence_json ? 'initial_delay_seconds'
   or reply_cadence_json ? 'coalesce_window_seconds';

-- Update the column default for new rows.
alter table agent_versions
  alter column reply_cadence_json
  set default '{"reply_delay_seconds": 30, "followup_delay_seconds": 3600, "max_followups": 5}'::jsonb;
