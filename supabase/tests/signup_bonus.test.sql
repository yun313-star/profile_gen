begin;
select plan(4);

insert into auth.users (id, email, raw_user_meta_data)
  values ('00000000-0000-0000-0000-0000000000d1', 'd1@test.dev', '{"name":"테스터"}'::jsonb);

select is(
  (select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000d1'),
  1,
  'signup: profile row created for new auth user'
);
select is(
  (select credit_balance from public.profiles where id = '00000000-0000-0000-0000-0000000000d1'),
  3,
  'signup: free balance is 3 (FREE_SIGNUP_CREDITS)'
);
select is(
  (select delta from public.credit_ledger
     where user_id = '00000000-0000-0000-0000-0000000000d1' and reason = 'signup_bonus'),
  3,
  'signup: signup_bonus ledger row delta = 3'
);
select is(
  (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000d1'),
  '테스터',
  'signup: display_name copied from auth metadata'
);

select * from finish();
rollback;
