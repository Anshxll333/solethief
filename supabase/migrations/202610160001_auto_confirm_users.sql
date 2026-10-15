begin;

-- 1. Helper function to confirm any user's email by address
create or replace function public.confirm_user_email(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if p_email is null or length(trim(p_email)) = 0 then
    return false;
  end if;

  update auth.users
  set email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
  where lower(trim(email)) = lower(trim(p_email));

  return true;
end;
$$;

revoke all on function public.confirm_user_email(text) from public;
grant execute on function public.confirm_user_email(text) to anon, authenticated, service_role;

-- 2. Trigger function to auto-confirm all future signups immediately
create or replace function public.auto_confirm_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists tr_auto_confirm_new_user on auth.users;
create trigger tr_auto_confirm_new_user
  before insert or update on auth.users
  for each row execute function public.auto_confirm_new_user();

-- 3. Confirm all existing users in the database right now
update auth.users
set email_confirmed_at = now(),
    updated_at = now()
where email_confirmed_at is null;

commit;
