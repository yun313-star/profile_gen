begin;
select plan(3);

select ok(
  exists(select 1 from pg_trigger where tgname = 'generation_jobs_broadcast'
         and tgrelid = 'public.generation_jobs'::regclass),
  'AFTER UPDATE broadcast trigger exists');

select has_function('public', 'broadcast_job_change', 'trigger fn exists');

select ok(
  exists(select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
         and policyname = 'job_owner_can_read'),
  'realtime.messages owner read policy exists');

select * from finish();
rollback;
