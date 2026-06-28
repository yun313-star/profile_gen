create extension if not exists pgmq;

select pgmq.create('generation');

-- Fixed-queue wrappers so the app calls them via supabase.rpc on the public schema.
create or replace function public.pgmq_send(p_msg jsonb)
returns bigint language sql security definer
set search_path = pgmq, public as $$
  select pgmq.send('generation', p_msg);
$$;

create or replace function public.pgmq_read(p_qty int, p_vt int)
returns table(msg_id bigint, message jsonb) language sql security definer
set search_path = pgmq, public as $$
  select msg_id, message from pgmq.read('generation', p_vt, p_qty);
$$;

create or replace function public.pgmq_delete(p_msg_id bigint)
returns boolean language sql security definer
set search_path = pgmq, public as $$
  select pgmq.delete('generation', p_msg_id);
$$;

create or replace function public.pgmq_archive(p_msg_id bigint)
returns boolean language sql security definer
set search_path = pgmq, public as $$
  select pgmq.archive('generation', p_msg_id);
$$;

-- Only the service role (worker/producer) may touch the queue.
revoke all on function public.pgmq_send(jsonb) from public, anon, authenticated;
revoke all on function public.pgmq_read(int, int) from public, anon, authenticated;
revoke all on function public.pgmq_delete(bigint) from public, anon, authenticated;
revoke all on function public.pgmq_archive(bigint) from public, anon, authenticated;
grant execute on function public.pgmq_send(jsonb) to service_role;
grant execute on function public.pgmq_read(int, int) to service_role;
grant execute on function public.pgmq_delete(bigint) to service_role;
grant execute on function public.pgmq_archive(bigint) to service_role;
