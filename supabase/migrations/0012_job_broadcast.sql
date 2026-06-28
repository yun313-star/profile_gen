-- Broadcast every job UPDATE to a private per-job topic "job_<id>".
create or replace function public.broadcast_job_change()
returns trigger language plpgsql security definer
set search_path = public, realtime as $$
begin
  perform realtime.broadcast_changes(
    'job_' || new.id::text,  -- topic
    tg_op,                   -- event
    tg_op,                   -- operation
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return new;
end $$;

create trigger generation_jobs_broadcast
  after update on public.generation_jobs
  for each row execute function public.broadcast_job_change();

-- Private channel authorization: a client may read messages for topic job_<id>
-- only when they own that job.
alter table realtime.messages enable row level security;

create policy "job_owner_can_read" on realtime.messages
  for select to authenticated
  using (
    exists (
      select 1 from public.generation_jobs j
      where 'job_' || j.id::text = realtime.topic()
        and j.user_id = auth.uid()
    )
  );
