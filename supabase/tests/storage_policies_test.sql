begin;
select plan(6);

-- buckets exist and are private
select is(
  (select count(*)::int from storage.buckets where id = 'selfies' and public = false),
  1, 'selfies bucket exists and is private');
select is(
  (select count(*)::int from storage.buckets where id = 'outputs' and public = false),
  1, 'outputs bucket exists and is private');

-- owner-scoped policies present on storage.objects
select ok(
  exists(select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
         and policyname = 'selfies_owner_rw'),
  'selfies owner policy exists');
select ok(
  exists(select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
         and policyname = 'outputs_owner_rw'),
  'outputs owner policy exists');

-- RLS is enabled on storage.objects
select ok(
  (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass),
  'RLS enabled on storage.objects');

-- the policy text references the owner-folder check
select ok(
  exists(select 1 from pg_policies where tablename='objects'
         and policyname='outputs_owner_rw' and qual like '%foldername%'),
  'outputs policy scopes to owner folder');

select * from finish();
rollback;
