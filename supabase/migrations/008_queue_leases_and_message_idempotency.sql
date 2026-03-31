alter type job_status add value if not exists 'cancelled';

alter table jobs
add column if not exists started_at timestamptz,
add column if not exists heartbeat_at timestamptz,
add column if not exists lease_expires_at timestamptz,
add column if not exists completed_at timestamptz,
add column if not exists worker_id text,
add column if not exists last_error_at timestamptz;

alter table messages
add column if not exists source_job_id uuid references jobs(id);

create index if not exists idx_jobs_queue_claim
on jobs(queue_name, status, run_at, lease_expires_at);

create index if not exists idx_jobs_worker_running
on jobs(worker_id, status, lease_expires_at)
where worker_id is not null;

create unique index if not exists idx_messages_source_job_id
on messages(source_job_id)
where source_job_id is not null;

create unique index if not exists idx_messages_provider_message_id
on messages(provider_message_id)
where provider_message_id is not null;

create or replace function claim_next_job(
  p_queue_name text,
  p_worker_id text,
  p_lease_seconds integer default 90
)
returns jobs as $$
declare
  claimed_job jobs;
begin
  select * into claimed_job
  from jobs
  where queue_name = p_queue_name
    and (
      (status = 'pending' and run_at <= now())
      or (
        status = 'running'
        and lease_expires_at is not null
        and lease_expires_at <= now()
      )
    )
  order by run_at asc, created_at asc
  limit 1
  for update skip locked;

  if claimed_job.id is not null then
    update jobs
    set status = 'running',
        attempts = attempts + 1,
        worker_id = p_worker_id,
        started_at = coalesce(started_at, now()),
        heartbeat_at = now(),
        lease_expires_at = now() + make_interval(secs => greatest(p_lease_seconds, 15))
    where id = claimed_job.id
    returning * into claimed_job;
  end if;

  return claimed_job;
end;
$$ language plpgsql;
