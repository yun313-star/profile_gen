-- Broadcast every job UPDATE to a private per-job topic "job_<id>".
-- BEST-EFFORT: a realtime failure (e.g. realtime.messages not yet provisioned on a
-- freshly-created cloud project) must NEVER block the core generation_jobs UPDATE that
-- the worker performs — so the broadcast is wrapped in its own exception handler.
create or replace function public.broadcast_job_change()
returns trigger language plpgsql security definer
set search_path = public, realtime as $$
begin
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
  exception when others then
    -- realtime unavailable on this project; do not block the job update.
    null;
  end;
  return new;
end $$;

drop trigger if exists generation_jobs_broadcast on public.generation_jobs;
create trigger generation_jobs_broadcast
  after update on public.generation_jobs
  for each row execute function public.broadcast_job_change();

-- Private channel authorization: a client may read messages for topic job_<id> only when
-- they own that job. GUARDED: realtime.messages is a Supabase-managed table that is NOT
-- present on a freshly-created cloud project (it exists on the local stack + initialized
-- projects). Apply the RLS where the table exists; otherwise skip with a notice (the
-- Realtime Authorization policy can be added via the dashboard once the table appears).
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'alter table realtime.messages enable row level security';
    if not exists (
      select 1 from pg_policies
      where schemaname = 'realtime' and tablename = 'messages' and policyname = 'job_owner_can_read'
    ) then
      execute $p$
        create policy "job_owner_can_read" on realtime.messages
          for select to authenticated
          using (
            exists (
              select 1 from public.generation_jobs j
              where 'job_' || j.id::text = realtime.topic()
                and j.user_id = auth.uid()
            )
          )
      $p$;
    end if;
  else
    raise notice 'realtime.messages not present; skipping broadcast RLS (apply via Realtime Authorization once the table exists)';
  end if;
end $$;
