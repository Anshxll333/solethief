begin;

-- ==============================================================================
-- 1. Insert configured admin users into public.admin_roles
-- ==============================================================================
insert into public.admin_roles (user_id, role)
select id, 'admin'
from auth.users
where lower(trim(email)) in ('abhix406@gmail.com', 'soniabhinav753@gmail.com')
on conflict (user_id) do nothing;

-- ==============================================================================
-- 2. Enhance is_shop_admin() RPC to auto-promote configured admin emails
-- ==============================================================================
create or replace function public.is_shop_admin()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid;
  v_email text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return false;
  end if;

  -- 1. Check if user already has an active record in public.admin_roles
  if exists (
    select 1 from public.admin_roles
    where user_id = v_uid and role = 'admin'
  ) then
    return true;
  end if;

  -- 2. If user's verified email matches configured admins, automatically insert and grant
  select lower(trim(coalesce(email, ''))) into v_email
  from auth.users
  where id = v_uid;

  if v_email in ('abhix406@gmail.com', 'soniabhinav753@gmail.com') then
    insert into public.admin_roles (user_id, role)
    values (v_uid, 'admin')
    on conflict (user_id) do nothing;
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.is_shop_admin() from public;
grant execute on function public.is_shop_admin() to anon, authenticated, service_role;

commit;
