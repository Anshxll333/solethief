begin;

-- Admin catalog metadata and normalized size stock. Existing storefront columns remain unchanged.
alter table public.products
  add column if not exists compare_price_minor integer,
  add column if not exists status text not null default 'draft',
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists category_id uuid;

alter table public.products
  add constraint products_compare_price_check check (compare_price_minor is null or compare_price_minor >= price_minor),
  add constraint products_status_check check (status in ('active', 'sold_out', 'draft'));

create table if not exists public.product_sizes (
  product_id integer not null references public.products(id) on delete cascade,
  size text not null check (length(trim(size)) > 0),
  quantity integer not null default 0 check (quantity >= 0),
  primary key (product_id, size)
);

create table if not exists public.shop_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (name = btrim(name) and length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now()
);

create index if not exists product_sizes_product_idx on public.product_sizes(product_id);
create index if not exists products_status_idx on public.products(status);

create or replace function public.sync_product_sold_out_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  has_stock boolean;
begin
  select exists (select 1 from public.product_sizes where product_id = coalesce(new.product_id, old.product_id) and quantity > 0) into has_stock;
  update public.products set status = case when has_stock then 'active' else 'sold_out' end
    where id = coalesce(new.product_id, old.product_id) and status <> 'draft';
  return coalesce(new, old);
end;
$$;

drop trigger if exists product_sizes_status_sync on public.product_sizes;
create trigger product_sizes_status_sync after insert or update or delete on public.product_sizes
for each row execute function public.sync_product_sold_out_status();

create or replace function public.decrement_product_stock(p_product_id integer, p_size text, p_quantity integer default 1)
returns integer language plpgsql security definer set search_path = public as $$
declare remaining integer;
begin
  if p_quantity <= 0 then raise exception 'Quantity must be positive'; end if;
  update public.product_sizes set quantity = quantity - p_quantity
    where product_id = p_product_id and size = p_size and quantity >= p_quantity
    returning quantity into remaining;
  if remaining is null then raise exception 'Insufficient stock'; end if;
  return remaining;
end;
$$;

alter table public.product_sizes enable row level security;
alter table public.shop_tags enable row level security;
revoke all on public.product_sizes, public.shop_tags from public, anon, authenticated;
grant select on public.product_sizes, public.shop_tags to anon, authenticated;
grant all on public.product_sizes, public.shop_tags to service_role;
grant execute on function public.decrement_product_stock(integer, text, integer) to authenticated;

create policy product_sizes_public_read on public.product_sizes for select to anon, authenticated using (
  exists (select 1 from public.products p where p.id = product_id and p.active and p.status <> 'draft')
);
create policy shop_tags_public_read on public.shop_tags for select to anon, authenticated using (true);

commit;
