begin;

alter table public.orders
  add column if not exists tracking_id text,
  add column if not exists fulfillment_notes text;

create table if not exists public.order_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null,
  notes text,
  tracking_id text,
  created_at timestamptz not null default now()
);
create index if not exists order_history_order_idx on public.order_history(order_id, created_at desc);

alter table public.order_history enable row level security;
revoke all on public.order_history from public, anon, authenticated;
grant all on public.order_history to service_role;

drop policy if exists order_history_admin_read on public.order_history;
create policy order_history_admin_read on public.order_history for select to authenticated using (public.is_shop_admin());

create or replace function public.admin_update_order_fulfillment(p_order_id uuid, p_status text, p_notes text default null, p_tracking_id text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_shop_admin() then raise exception 'Shop administrator required'; end if;
  update public.orders set status = p_status, fulfillment_notes = coalesce(p_notes, fulfillment_notes), tracking_id = coalesce(p_tracking_id, tracking_id)
    where id = p_order_id returning to_jsonb(orders.*) into result;
  if result is null then raise exception 'Order not found'; end if;
  insert into public.order_history(order_id, status, notes, tracking_id) values (p_order_id, p_status, p_notes, p_tracking_id);
  return result;
end;
$$;

grant execute on function public.admin_update_order_fulfillment(uuid, text, text, text) to authenticated;

create or replace function public.admin_initiate_order_return(p_order_id uuid, p_action text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare next_status text; result jsonb;
begin
  if not public.is_shop_admin() then raise exception 'Shop administrator required'; end if;
  if p_action not in ('return', 'replace') or length(btrim(p_reason)) = 0 then raise exception 'Valid return/replace reason required'; end if;
  next_status := case when p_action = 'replace' then 'replaced' else 'returned' end;
  update public.orders set status = next_status, fulfillment_notes = btrim(p_reason) where id = p_order_id returning to_jsonb(orders.*) into result;
  if result is null then raise exception 'Order not found'; end if;
  insert into public.order_history(order_id, status, notes) values (p_order_id, next_status, p_action || ': ' || btrim(p_reason));
  return result;
end;
$$;
grant execute on function public.admin_initiate_order_return(uuid, text, text) to authenticated;

commit;
