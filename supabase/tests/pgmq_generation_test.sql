begin;
select plan(4);

-- queue table exists (pgmq names it q_<queue>)
select ok(
  to_regclass('pgmq.q_generation') is not null,
  'pgmq generation queue created');

-- wrapper functions exist
select has_function('public', 'pgmq_send', array['jsonb'], 'pgmq_send wrapper exists');
select has_function('public', 'pgmq_read', array['integer','integer'], 'pgmq_read wrapper exists');

-- round-trip: send then read returns the message body
do $$
declare v_id bigint; v_cnt int;
begin
  perform public.pgmq_send('{"job_id":"00000000-0000-0000-0000-000000000001"}'::jsonb);
  select count(*) into v_cnt from public.pgmq_read(1, 5)
    where message->>'job_id' = '00000000-0000-0000-0000-000000000001';
  if v_cnt <> 1 then raise exception 'round-trip read failed: %', v_cnt; end if;
end $$;
select ok(true, 'send/read round-trip works');

select * from finish();
rollback;
