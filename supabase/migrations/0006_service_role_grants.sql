-- service_role table grants (server-side write posture).
--
-- service_role is the trusted server-side role: it is NEVER exposed to clients
-- (SUPABASE_SERVICE_ROLE_KEY is server-only) and bypasses RLS. 0002_rls.sql granted
-- table privileges only to `authenticated`, assuming service_role already held the
-- Supabase-default `GRANT ALL`. Where that default is absent, service_role had NO DML
-- on the app tables, so every server-side write failed at runtime with
-- "permission denied for table ..." — onboarding age_verified, order create/update,
-- worker job status + asset inserts, reconcile, and account data deletion all break.
-- (0005 granted only UPDATE(age_verified) + INSERT(consents); but a column-level UPDATE
-- still needs SELECT to resolve WHERE/RETURNING, so even those failed.)
--
-- Restore the standard backend posture: full DML for service_role. Client-facing
-- security is unchanged — RLS plus the authenticated/anon grants still gate every
-- client request; this only re-enables the trusted server role to do server work.

grant select, insert, update, delete on all tables in schema public to service_role;

-- Future tables created by the migration owner inherit the same posture.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
