begin;
select plan(13);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'c1@test.dev');
insert into public.profiles (id, credit_balance) values
  ('00000000-0000-0000-0000-0000000000c1', 3);

-- debit 1 credit
select lives_ok(
  $$ select public.debit_credits('00000000-0000-0000-0000-0000000000c1', 1,
       '00000000-0000-0000-0000-000000000001') $$,
  'debit_credits: debits without error'
);
select is(
  (select credit_balance from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  2,
  'debit_credits: balance 3 -> 2'
);
select is(
  (select delta from public.credit_ledger
     where user_id = '00000000-0000-0000-0000-0000000000c1' and reason = 'generation_hold'),
  -1,
  'debit_credits: writes generation_hold ledger delta -1'
);

-- insufficient: try to debit 100
select throws_ok(
  $$ select public.debit_credits('00000000-0000-0000-0000-0000000000c1', 100,
       '00000000-0000-0000-0000-000000000002') $$,
  'INSUFFICIENT_CREDITS',
  'debit_credits: throws INSUFFICIENT_CREDITS when balance too low'
);

-- refund the held credit
select lives_ok(
  $$ select public.refund_hold('00000000-0000-0000-0000-0000000000c1', 1,
       '00000000-0000-0000-0000-000000000001') $$,
  'refund_hold: releases without error'
);
select is(
  (select credit_balance from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  3,
  'refund_hold: balance 2 -> 3'
);

-- grant (purchase) adds credits + ledger
select lives_ok(
  $$ select public.grant_credits('00000000-0000-0000-0000-0000000000c1', 10, 'purchase', 'order',
       '00000000-0000-0000-0000-000000000010') $$,
  'grant_credits: purchase grant succeeds'
);
-- balance is now 13 (3 -1 debit +1 refund +10 grant).

-- clawback_credits: dedicated negative refund path (deducts, writes negative 'refund' ledger).
select lives_ok(
  $$ select public.clawback_credits('00000000-0000-0000-0000-0000000000c1', 5,
       '00000000-0000-0000-0000-000000000010') $$,
  'clawback_credits: deducts without error'
);
select is(
  (select credit_balance from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  8,
  'clawback_credits: balance 13 -> 8'
);
select is(
  (select delta from public.credit_ledger
     where user_id = '00000000-0000-0000-0000-0000000000c1' and reason = 'refund'
     order by id desc limit 1),
  -5,
  'clawback_credits: writes negative refund ledger delta -5'
);

-- clawback larger than balance floors at 0 (deducts only what remains).
select lives_ok(
  $$ select public.clawback_credits('00000000-0000-0000-0000-0000000000c1', 100,
       '00000000-0000-0000-0000-000000000010') $$,
  'clawback_credits: over-clawback does not error'
);
select is(
  (select credit_balance from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  0,
  'clawback_credits: balance floors at 0 (never negative)'
);

select matches(
  (select pg_get_functiondef('public.debit_credits(uuid,int,uuid)'::regprocedure)),
  'for update',
  'debit_credits: balance row is locked FOR UPDATE (concurrency safety)'
);

select * from finish();
rollback;
