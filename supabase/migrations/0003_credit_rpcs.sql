-- ProfAI Phase 1: credit RPCs (SECURITY DEFINER, called server-side via service-role).

create or replace function public.debit_credits(p_user uuid, p_amount int, p_job uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bal int;
  v_ledger bigint;
begin
  if p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  -- Lock the balance row to serialize concurrent debits.
  select credit_balance into v_bal from public.profiles where id = p_user for update;
  if v_bal is null then
    raise exception 'PROFILE_NOT_FOUND';
  end if;
  if v_bal < p_amount then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;
  update public.profiles
    set credit_balance = credit_balance - p_amount
    where id = p_user;
  insert into public.credit_ledger (user_id, delta, reason, ref_type, ref_id)
    values (p_user, -p_amount, 'generation_hold', 'job', p_job)
    returning id into v_ledger;
  return v_ledger;
end;
$$;

create or replace function public.grant_credits(
  p_user uuid, p_amount int, p_reason text, p_ref_type text, p_ref_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_reason not in ('purchase','refund','release','signup_bonus') then
    raise exception 'INVALID_REASON';
  end if;
  update public.profiles
    set credit_balance = credit_balance + p_amount
    where id = p_user;
  insert into public.credit_ledger (user_id, delta, reason, ref_type, ref_id)
    values (p_user, p_amount, p_reason, p_ref_type, p_ref_id);
end;
$$;

create or replace function public.refund_hold(p_user uuid, p_amount int, p_job uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  update public.profiles
    set credit_balance = credit_balance + p_amount
    where id = p_user;
  insert into public.credit_ledger (user_id, delta, reason, ref_type, ref_id)
    values (p_user, p_amount, 'release', 'job', p_job);
end;
$$;

-- Dedicated negative path for payment refunds (Phase 3 payapp feedback refund branch).
-- Deducts LEAST(p_amount, balance), floors balance at 0, writes a negative 'refund' ledger row.
-- This exists so refunds NEVER call grant_credits with a negative amount (that keeps p_amount>0).
create or replace function public.clawback_credits(p_user uuid, p_amount int, p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bal int;
  v_deduct int;
begin
  if p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  -- Lock the balance row to serialize against concurrent debits/grants.
  select credit_balance into v_bal from public.profiles where id = p_user for update;
  if v_bal is null then
    raise exception 'PROFILE_NOT_FOUND';
  end if;
  v_deduct := least(p_amount, v_bal);   -- never push the balance below 0
  update public.profiles
    set credit_balance = credit_balance - v_deduct
    where id = p_user;
  insert into public.credit_ledger (user_id, delta, reason, ref_type, ref_id)
    values (p_user, -v_deduct, 'refund', 'order', p_order);
end;
$$;

-- Lock down execution: only service_role may call these (server-side).
revoke all on function public.debit_credits(uuid, int, uuid) from public, anon, authenticated;
revoke all on function public.grant_credits(uuid, int, text, text, uuid) from public, anon, authenticated;
revoke all on function public.refund_hold(uuid, int, uuid) from public, anon, authenticated;
revoke all on function public.clawback_credits(uuid, int, uuid) from public, anon, authenticated;
grant execute on function public.debit_credits(uuid, int, uuid) to service_role;
grant execute on function public.grant_credits(uuid, int, text, text, uuid) to service_role;
grant execute on function public.refund_hold(uuid, int, uuid) to service_role;
grant execute on function public.clawback_credits(uuid, int, uuid) to service_role;
