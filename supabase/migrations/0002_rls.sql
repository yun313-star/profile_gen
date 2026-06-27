-- ProfAI Phase 1: RLS — every user-scoped row is own-row only (user_id = auth.uid()).
-- Grant table-level privileges to authenticated role (RLS is a secondary layer). Anon receives no grants.

-- profiles: select + update (no insert/delete — trigger + service-role only)
grant select, update on public.profiles to authenticated;
-- consents: select + insert (users agree from the client)
grant select, insert on public.consents to authenticated;
-- credit_ledger: read-only to clients (writes via SECURITY DEFINER RPC / service-role).
-- INSERT is granted so RLS (not the privilege layer) is the gate — proves the "no insert policy" test.
grant select on public.credit_ledger to authenticated;
-- orders: read-only to clients (writes via service-role in payapp routes)
grant select on public.orders to authenticated;
-- generation_jobs: read-only to clients (writes via server with service-role)
grant select on public.generation_jobs to authenticated;
-- assets: read-only to clients (writes via server)
grant select on public.assets to authenticated;
-- style_presets: readable to authenticated users (catalog)
grant select on public.style_presets to authenticated;


alter table public.profiles enable row level security;
alter table public.consents enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.orders enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.assets enable row level security;
alter table public.style_presets enable row level security;

-- profiles: own row select/update (id = auth.uid()). No client insert/delete (trigger + service-role only).
create policy profiles_select_own on public.profiles
  for select using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- consents: own-row select + insert (user agrees from the client).
create policy consents_select_own on public.consents
  for select using (user_id = (select auth.uid()));
create policy consents_insert_own on public.consents
  for insert with check (user_id = (select auth.uid()));

-- credit_ledger: own-row READ ONLY (writes via SECURITY DEFINER RPC / service-role only).
create policy credit_ledger_select_own on public.credit_ledger
  for select using (user_id = (select auth.uid()));

-- orders: own-row READ ONLY (writes via service-role in payapp routes).
create policy orders_select_own on public.orders
  for select using (user_id = (select auth.uid()));

-- generation_jobs: own-row READ ONLY (writes via server with service-role).
create policy generation_jobs_select_own on public.generation_jobs
  for select using (user_id = (select auth.uid()));

-- assets: own-row READ ONLY (writes via server).
create policy assets_select_own on public.assets
  for select using (user_id = (select auth.uid()));

-- style_presets: any authenticated user may read active presets (catalog).
create policy style_presets_read on public.style_presets
  for select to authenticated using (true);
