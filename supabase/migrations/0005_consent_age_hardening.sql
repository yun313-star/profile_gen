-- Security hardening: make profiles.age_verified and public.consents writes server-authoritative.
-- Clients (authenticated, anon) may no longer write these; only the service-role server action may.
--
-- IMPORTANT: PostgreSQL column-level REVOKE cannot restrict a pre-existing table-level GRANT.
-- 0002_rls.sql granted table-level UPDATE on profiles to authenticated.
-- We must revoke the table-level grant first, then re-grant column-level UPDATE for user-editable
-- columns only (display_name, phone), which excludes age_verified at the privilege layer.
--
-- Effect: authenticated clients can still update display_name and phone (per profiles_update_own
-- RLS policy), but any attempt to SET age_verified is denied with SQLSTATE 42501.

-- 1. profiles.age_verified — server-authoritative (service-role write only).
revoke update on public.profiles from authenticated, anon;
grant update (display_name, phone) on public.profiles to authenticated;
-- Belt-and-suspenders: service_role explicitly owns age_verified writes.
grant update (age_verified) on public.profiles to service_role;

-- 2. consents — revoke client INSERT; server action uses service_role exclusively.
revoke insert on public.consents from authenticated, anon;
drop policy if exists consents_insert_own on public.consents;
-- Belt-and-suspenders: service_role INSERT on consents.
grant insert on public.consents to service_role;
