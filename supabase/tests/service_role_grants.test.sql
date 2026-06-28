begin;
select plan(8);

-- Regression guard for migration 0006.
--
-- service_role is the trusted server-side role and performs every server-side write:
-- onboarding age_verified UPDATE, order create INSERT/UPDATE, worker job-status UPDATE +
-- asset INSERT, reconcile, and account-deletion DELETE across all owned tables. If
-- service_role lacks any of these table privileges, the write fails at runtime with
-- "permission denied for table ..." — a failure the Supabase-mocked unit suite cannot
-- catch (it only surfaces against a real Postgres + PostgREST). 0002 granted table privs
-- to `authenticated` only, assuming service_role held the Supabase-default GRANT ALL;
-- where that default is absent the app's whole write path breaks. 0006 restores it.

select ok(
  has_table_privilege('service_role', 'public.profiles', 'SELECT')
  and has_table_privilege('service_role', 'public.profiles', 'INSERT')
  and has_table_privilege('service_role', 'public.profiles', 'UPDATE')
  and has_table_privilege('service_role', 'public.profiles', 'DELETE'),
  'service_role has full DML on profiles'
);
select ok(
  has_table_privilege('service_role', 'public.orders', 'SELECT')
  and has_table_privilege('service_role', 'public.orders', 'INSERT')
  and has_table_privilege('service_role', 'public.orders', 'UPDATE')
  and has_table_privilege('service_role', 'public.orders', 'DELETE'),
  'service_role has full DML on orders'
);
select ok(
  has_table_privilege('service_role', 'public.generation_jobs', 'SELECT')
  and has_table_privilege('service_role', 'public.generation_jobs', 'INSERT')
  and has_table_privilege('service_role', 'public.generation_jobs', 'UPDATE')
  and has_table_privilege('service_role', 'public.generation_jobs', 'DELETE'),
  'service_role has full DML on generation_jobs'
);
select ok(
  has_table_privilege('service_role', 'public.credit_ledger', 'SELECT')
  and has_table_privilege('service_role', 'public.credit_ledger', 'INSERT')
  and has_table_privilege('service_role', 'public.credit_ledger', 'UPDATE')
  and has_table_privilege('service_role', 'public.credit_ledger', 'DELETE'),
  'service_role has full DML on credit_ledger'
);
select ok(
  has_table_privilege('service_role', 'public.assets', 'SELECT')
  and has_table_privilege('service_role', 'public.assets', 'INSERT')
  and has_table_privilege('service_role', 'public.assets', 'UPDATE')
  and has_table_privilege('service_role', 'public.assets', 'DELETE'),
  'service_role has full DML on assets'
);
select ok(
  has_table_privilege('service_role', 'public.consents', 'SELECT')
  and has_table_privilege('service_role', 'public.consents', 'INSERT')
  and has_table_privilege('service_role', 'public.consents', 'DELETE'),
  'service_role can read/insert/delete consents'
);
select ok(
  has_table_privilege('service_role', 'public.style_presets', 'SELECT'),
  'service_role can read style_presets'
);

-- The 0005 client hardening must survive 0006: authenticated still cannot UPDATE profiles
-- (so age_verified stays server-authoritative). 0006 only re-grants the server role.
select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
  'authenticated still cannot UPDATE profiles (0005 hardening preserved)'
);

select * from finish();
rollback;
