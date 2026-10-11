begin;

-- One product represents one individually photographed pair, not pooled variant stock.
create table public.products (
  id integer primary key check (id > 0),
  name text not null check (length(trim(name)) > 0),
  brand text not null check (length(trim(brand)) > 0),
  size text not null check (length(trim(size)) > 0),
  price_minor integer not null check (price_minor >= 0),
  currency text not null default 'INR' check (currency = 'INR'),
  front_image text not null,
  side_image text not null,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (length(display_name) <= 120),
  phone text check (length(phone) <= 32),
  created_at timestamptz not null default now()
);

-- No browser grants or policies: roles are provisioned by trusted operators only.
create table public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role = 'admin'),
  created_at timestamptz not null default now()
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient text not null check (length(trim(recipient)) between 1 and 120),
  phone text not null check (length(trim(phone)) between 1 and 32),
  line1 text not null check (length(trim(line1)) between 1 and 200),
  line2 text check (length(line2) <= 200),
  city text not null check (length(trim(city)) between 1 and 100),
  region text not null check (length(trim(region)) between 1 and 100),
  postal_code text not null check (postal_code ~ '^[0-9]{6}$'),
  country_code text not null default 'IN' check (country_code = 'IN'),
  created_at timestamptz not null default now()
);
create index addresses_user_idx on public.addresses(user_id);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'expired', 'refunded')),
  currency text not null default 'INR' check (currency = 'INR'),
  subtotal_minor integer not null check (subtotal_minor >= 0),
  shipping_minor integer not null default 0 check (shipping_minor >= 0),
  tax_minor integer not null default 0 check (tax_minor >= 0),
  discount_minor integer not null default 0 check (discount_minor >= 0 and discount_minor <= subtotal_minor),
  total_minor integer not null check (total_minor >= 0),
  shipping_address jsonb not null check (jsonb_typeof(shipping_address) = 'object' and shipping_address <> '{}'::jsonb),
  idempotency_key uuid not null,
  payment_provider text not null default 'razorpay' check (payment_provider = 'razorpay'),
  provider_order_id text unique,
  provider_payment_id text unique,
  expires_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check (total_minor::bigint = subtotal_minor::bigint + shipping_minor::bigint + tax_minor::bigint - discount_minor::bigint),
  check (expires_at > created_at),
  check (status not in ('paid', 'processing', 'shipped', 'delivered', 'refunded') or (paid_at is not null and provider_order_id is not null and provider_payment_id is not null))
);
create index orders_user_created_idx on public.orders(user_id, created_at desc);
create index orders_pending_expiry_idx on public.orders(expires_at) where status = 'pending_payment';

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  product_id integer not null references public.products(id) on delete restrict,
  name text not null,
  brand text not null,
  size text not null,
  front_image text not null,
  quantity integer not null default 1 check (quantity = 1),
  unit_price_minor integer not null check (unit_price_minor >= 0),
  line_total_minor integer generated always as (quantity * unit_price_minor) stored,
  unique (order_id, product_id)
);
create index order_items_product_idx on public.order_items(product_id);

create table public.inventory_pairs (
  product_id integer primary key references public.products(id) on delete restrict,
  state text not null default 'unavailable' check (state in ('unavailable', 'available', 'reserved', 'sold')),
  order_id uuid references public.orders(id) on delete restrict,
  reserved_until timestamptz,
  check (
    (state in ('unavailable', 'available') and order_id is null and reserved_until is null)
    or (state = 'reserved' and order_id is not null and reserved_until is not null)
    or (state = 'sold' and order_id is not null and reserved_until is null)
  )
);
create index inventory_pairs_order_idx on public.inventory_pairs(order_id);
create index inventory_pairs_expiry_idx on public.inventory_pairs(reserved_until) where state = 'reserved';

alter table public.products enable row level security;
alter table public.profiles enable row level security;
alter table public.admin_roles enable row level security;
alter table public.addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.inventory_pairs enable row level security;

-- Explicit grants avoid relying on Supabase's project-specific default privileges.
revoke all on public.products, public.profiles, public.admin_roles, public.addresses,
  public.orders, public.order_items, public.inventory_pairs from public, anon, authenticated;
grant select on public.products to anon, authenticated;
grant select on public.profiles, public.addresses, public.orders, public.order_items to authenticated;
grant insert (id, display_name, phone), update (display_name, phone) on public.profiles to authenticated;
grant insert (user_id, recipient, phone, line1, line2, city, region, postal_code, country_code),
  update (recipient, phone, line1, line2, city, region, postal_code, country_code) on public.addresses to authenticated;
grant delete on public.addresses to authenticated;
grant all on public.products, public.profiles, public.admin_roles, public.addresses,
  public.orders, public.order_items, public.inventory_pairs to service_role;

create policy products_public_read on public.products for select to anon, authenticated using (active);
create policy profiles_self_read on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_self_insert on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_self_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy addresses_self_read on public.addresses for select to authenticated using (user_id = (select auth.uid()));
create policy addresses_self_insert on public.addresses for insert to authenticated with check (user_id = (select auth.uid()));
create policy addresses_self_update on public.addresses for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy addresses_self_delete on public.addresses for delete to authenticated using (user_id = (select auth.uid()));
create policy orders_self_read on public.orders for select to authenticated using (user_id = (select auth.uid()));
create policy order_items_self_read on public.order_items for select to authenticated using (
  exists (select 1 from public.orders where orders.id = order_items.order_id and orders.user_id = (select auth.uid()))
);

-- No checkout RPCs yet. Cross-table totals and state transitions must be enforced
-- by later trusted transactional functions, never a series of browser writes.
commit;
