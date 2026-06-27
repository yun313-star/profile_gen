-- ProfAI Phase 1: on new auth user, create profile + grant FREE_SIGNUP_CREDITS (=3).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, phone)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name'),
      new.phone
    )
    on conflict (id) do nothing;

  -- Grant the 3-credit signup bonus exactly once (only when the profile was newly created).
  if found then
    perform public.grant_credits(new.id, 3, 'signup_bonus', 'auth', new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
