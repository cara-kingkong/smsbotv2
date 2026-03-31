alter table jobs
add column if not exists workspace_id uuid references workspaces(id) on delete cascade;

update jobs
set workspace_id = (payload_json->>'workspace_id')::uuid
where workspace_id is null
  and payload_json ? 'workspace_id'
  and (payload_json->>'workspace_id') ~* '^[0-9a-f-]{36}$';

update jobs
set workspace_id = conversations.workspace_id
from conversations
where jobs.workspace_id is null
  and jobs.payload_json ? 'conversation_id'
  and (jobs.payload_json->>'conversation_id') = conversations.id::text;

update jobs
set workspace_id = crm_events.workspace_id
from crm_events
where jobs.workspace_id is null
  and jobs.payload_json ? 'crm_event_id'
  and (jobs.payload_json->>'crm_event_id') = crm_events.id::text;

create index if not exists idx_jobs_workspace on jobs(workspace_id);
