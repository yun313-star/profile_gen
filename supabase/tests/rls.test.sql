begin;
select plan(6);

-- Seed two auth users + profiles directly (service context inside test).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test.dev');
insert into public.profiles (id, credit_balance) values
  ('00000000-0000-0000-0000-00000000000a', 5),
  ('00000000-0000-0000-0000-00000000000b', 5);
insert into public.credit_ledger (user_id, delta, reason) values
  ('00000000-0000-0000-0000-00000000000a', 5, 'signup_bonus'),
  ('00000000-0000-0000-0000-00000000000b', 5, 'signup_bonus');

-- Act as user A.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select is(
  (select count(*)::int from public.profiles),
  1,
  'profiles: user A sees only own profile row'
);
select is(
  (select credit_balance from public.profiles),
  5,
  'profiles: user A reads own balance'
);
select is(
  (select count(*)::int from public.credit_ledger),
  1,
  'ledger: user A sees only own ledger rows'
);

-- A direct ledger insert by the user must be blocked (no insert policy).
select throws_ok(
  $$ insert into public.credit_ledger (user_id, delta, reason)
     values ('00000000-0000-0000-0000-00000000000a', 999, 'purchase') $$,
  '42501',
  'new row violates row-level security policy for table "credit_ledger"',
  'ledger: direct client insert is denied by RLS'
);

-- A cannot select B's order.
-- Seed B's order as superuser (orders are write-only via service-role; no authenticated INSERT policy).
reset role;
insert into public.orders (user_id, pack_id, expected_amount, credits)
  values ('00000000-0000-0000-0000-00000000000b', 'starter', 9900, 10);
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is(
  (select count(*)::int from public.orders),
  0,
  'orders: user A cannot see user B order'
);

-- style_presets readable by authenticated.
reset role;
insert into public.style_presets (id, name_ko, family, model_key, prompt_template, size, quality)
  values ('t1', '테스트', 'free', 'gpt-image-1-mini', 'p', '1K', 'low');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
select is(
  (select count(*)::int from public.style_presets where id = 't1'),
  1,
  'style_presets: authenticated user can read catalog'
);

select * from finish();
rollback;
