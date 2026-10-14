begin;

alter table public.profiles add column if not exists is_blocked boolean not null default false;
alter table public.profiles add column if not exists block_reason text;
alter table public.profiles add column if not exists blocked_at timestamptz;
alter table public.profiles add column if not exists blocked_by uuid references auth.users(id);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null check (length(trim(subject)) between 1 and 200),
  status text not null default 'open' check (status in ('open', 'pending', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  body text not null check (length(trim(body)) between 1 and 10000),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists support_tickets_status_idx on public.support_tickets(status, updated_at desc);
create index if not exists support_ticket_messages_ticket_idx on public.support_ticket_messages(ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
revoke all on public.support_tickets, public.support_ticket_messages from public, anon, authenticated;
grant select on public.support_tickets, public.support_ticket_messages to authenticated;
grant all on public.support_tickets, public.support_ticket_messages to service_role;
create policy support_tickets_self_read on public.support_tickets for select to authenticated using (user_id = auth.uid() or public.is_shop_admin());
create policy support_messages_self_read on public.support_ticket_messages for select to authenticated using (exists (select 1 from public.support_tickets t where t.id = ticket_id and (t.user_id = auth.uid() or public.is_shop_admin())));

create or replace function public.admin_list_users(p_search text default null)
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  from (select p.id, p.display_name, p.phone, p.is_blocked, p.block_reason, p.created_at,
    u.email, (select count(*) from public.orders o where o.user_id = p.id) as order_count,
    (select coalesce(sum(o.total_minor), 0) from public.orders o where o.user_id = p.id) as lifetime_value
    from public.profiles p join auth.users u on u.id = p.id
    where public.is_shop_admin() and (p_search is null or lower(coalesce(p.display_name,'') || ' ' || coalesce(u.email,'') || ' ' || coalesce(p.phone,'')) like '%' || lower(p_search) || '%')) x
$$;
grant execute on function public.admin_list_users(text) to authenticated;

create or replace function public.admin_set_user_blocked(p_user_id uuid, p_blocked boolean, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_shop_admin() then raise exception 'Shop administrator required'; end if;
  update public.profiles set is_blocked = p_blocked, block_reason = case when p_blocked then nullif(btrim(p_reason), '') else null end, blocked_at = case when p_blocked then now() else null end, blocked_by = case when p_blocked then auth.uid() else null end where id = p_user_id returning to_jsonb(profiles.*) into result;
  if result is null then raise exception 'User not found'; end if;
  return result;
end; $$;
grant execute on function public.admin_set_user_blocked(uuid, boolean, text) to authenticated;

create or replace function public.admin_list_support_tickets(p_status text default null)
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc), '[]'::jsonb) from (
    select t.*, u.email, p.display_name, (select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]'::jsonb) from public.support_ticket_messages m where m.ticket_id = t.id) messages
    from public.support_tickets t join auth.users u on u.id=t.user_id left join public.profiles p on p.id=t.user_id
    where public.is_shop_admin() and (p_status is null or t.status=p_status)
  ) x
$$;
grant execute on function public.admin_list_support_tickets(text) to authenticated;

create or replace function public.admin_reply_support_ticket(p_ticket_id uuid, p_message text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_shop_admin() then raise exception 'Shop administrator required'; end if;
  if length(btrim(p_message)) = 0 then raise exception 'Reply message is required'; end if;
  insert into public.support_ticket_messages(ticket_id, author_id, body, is_admin) values (p_ticket_id, auth.uid(), btrim(p_message), true) returning to_jsonb(support_ticket_messages.*) into result;
  update public.support_tickets set status='pending', updated_at=now() where id=p_ticket_id;
  if result is null then raise exception 'Ticket not found'; end if;
  return result;
end; $$;
grant execute on function public.admin_reply_support_ticket(uuid, text) to authenticated;

-- Trusted order creation functions should reject blocked customers; storefront code remains untouched.
create or replace function public.assert_customer_not_blocked(p_user_id uuid default auth.uid()) returns void language plpgsql security definer set search_path=public as $$
begin if exists (select 1 from public.profiles where id=p_user_id and is_blocked) then raise exception 'Customer account is blocked'; end if; end; $$;
grant execute on function public.assert_customer_not_blocked(uuid) to authenticated;

commit;
