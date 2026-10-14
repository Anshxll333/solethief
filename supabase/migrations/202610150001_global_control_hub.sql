begin;

create table if not exists public.global_settings (
  id boolean primary key default true check (id),
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into public.global_settings(id, settings) values (true, '{}'::jsonb) on conflict (id) do nothing;

alter table public.global_settings enable row level security;
revoke all on public.global_settings from public, anon, authenticated;
grant select on public.global_settings to anon, authenticated;
create policy global_settings_public_read on public.global_settings for select to anon, authenticated using (true);

create or replace function public.admin_get_global_settings()
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.is_shop_admin() then raise exception 'Shop administrator required'; end if;
  return (select settings from public.global_settings where id=true);
end; $$;
grant execute on function public.admin_get_global_settings() to authenticated;

create or replace function public.admin_save_global_settings(p_settings jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare safe jsonb;
begin
  if not public.is_shop_admin() then raise exception 'Shop administrator required'; end if;
  safe := coalesce(p_settings, '{}'::jsonb) - 'secretKey' - 'secret_key' - 'paymentSecret' - 'payment_secret';
  insert into public.global_settings(id, settings, updated_at, updated_by) values (true, safe, now(), auth.uid())
    on conflict (id) do update set settings=excluded.settings, updated_at=now(), updated_by=auth.uid();
  return safe;
end; $$;
grant execute on function public.admin_save_global_settings(jsonb) to authenticated;

create or replace function public.admin_test_payment_connection()
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not public.is_shop_admin() then raise exception 'Shop administrator required'; end if;
  return jsonb_build_object('ok', false, 'error', 'Server-side payment connector is not configured.');
end; $$;
grant execute on function public.admin_test_payment_connection() to authenticated;

commit;
