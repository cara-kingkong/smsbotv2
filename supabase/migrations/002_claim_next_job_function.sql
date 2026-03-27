-- Atomic job claim function for queue processing
-- Prevents double-processing by using SELECT FOR UPDATE SKIP LOCKED

create or replace function claim_next_job(p_queue_name text)
returns jobs as $$
declare
  claimed_job jobs;
begin
  select * into claimed_job
  from jobs
  where queue_name = p_queue_name
    and status = 'pending'
    and run_at <= now()
  order by run_at asc
  limit 1
  for update skip locked;

  if claimed_job.id is not null then
    update jobs
    set status = 'running', attempts = attempts + 1
    where id = claimed_job.id
    returning * into claimed_job;
  end if;

  return claimed_job;
end;
$$ language plpgsql;
