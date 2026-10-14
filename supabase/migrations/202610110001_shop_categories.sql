begin;

-- Identity comes only from the verified request JWT, never an RPC argument.
create function public.is_shop_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_roles
    where user_id = (select auth.uid()) and role = 'admin'
  );
$$;
revoke all on function public.is_shop_admin() from public, anon, authenticated;
grant execute on function public.is_shop_admin() to anon, authenticated;

create table public.shop_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (name = btrim(name) and length(name) between 1 and 120 and name !~ '[[:cntrl:]]'),
  slug text not null unique check (length(slug) between 1 and 120 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  image_url text check (
    image_url is null or (
      length(image_url) between 1 and 2048
      and image_url !~ '[[:cntrl:]]'
      -- Deliberately excludes %, backslash, @, query strings and fragments.
      and image_url ~ '^(https://[A-Za-z0-9]+([.-][A-Za-z0-9]+)*(:[0-9]{1,5})?(/[A-Za-z0-9_./-]*)?|/[A-Za-z0-9_-][A-Za-z0-9_./-]*)$'
    )
  ),
  display_order integer not null default 0 check (display_order >= 0),
  is_visible boolean not null default true,
  created_at timestamptz not null default now() check (isfinite(created_at)),
  updated_at timestamptz not null default now() check (isfinite(updated_at) and updated_at >= created_at)
);

create function public.guard_shop_category_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.slug is distinct from old.slug
     or new.created_at is distinct from old.created_at then
    raise exception 'Category id, slug and created_at are immutable' using errcode = '23514';
  end if;
  new.updated_at := greatest(clock_timestamp(), old.updated_at);
  return new;
end;
$$;
revoke all on function public.guard_shop_category_update() from public, anon, authenticated;
create trigger shop_categories_update_guard
before update on public.shop_categories
for each row execute function public.guard_shop_category_update();

create table public.shop_category_products (
  category_id uuid not null references public.shop_categories(id) on delete cascade,
  product_id integer not null references public.products(id) on delete restrict,
  primary key (category_id, product_id)
);
create index shop_category_products_product_idx on public.shop_category_products(product_id);
create index shop_categories_display_idx on public.shop_categories(display_order, slug);

alter table public.shop_categories enable row level security;
alter table public.shop_category_products enable row level security;
revoke all on public.shop_categories, public.shop_category_products from public, anon, authenticated;
grant select on public.shop_categories, public.shop_category_products to anon, authenticated;
grant insert (name, slug, image_url, display_order, is_visible),
  update (name, image_url, display_order, is_visible) on public.shop_categories to authenticated;
grant delete on public.shop_categories to authenticated;
grant insert, update, delete on public.shop_category_products to authenticated;
grant all on public.shop_categories, public.shop_category_products to service_role;

create policy shop_categories_public_read on public.shop_categories
for select to anon, authenticated using (is_visible);
create policy shop_categories_admin_all on public.shop_categories
for all to authenticated
using ((select public.is_shop_admin())) with check ((select public.is_shop_admin()));
create policy shop_category_products_public_read on public.shop_category_products
for select to anon, authenticated using (
  exists (select 1 from public.shop_categories c where c.id = category_id and c.is_visible)
  and exists (select 1 from public.products p where p.id = product_id and p.active)
);
create policy shop_category_products_admin_all on public.shop_category_products
for all to authenticated
using ((select public.is_shop_admin())) with check ((select public.is_shop_admin()));
create policy products_shop_admin_read on public.products
for select to authenticated using ((select public.is_shop_admin()));

insert into public.shop_categories (name, slug, display_order) values
  ('Travis Scott', 'travis-scott', 1),
  ('Low Dunks', 'low-dunks', 2),
  ('Retro 4', 'retro-4', 3),
  ('Air Jordans', 'air-jordans', 4),
  ('Leather Shoes', 'leather-shoes', 5),
  ('Air Forces', 'air-forces', 6),
  ('Adidas', 'adidas', 7),
  ('New Balance', 'new-balance', 8),
  ('Limited', 'limited', 9)
on conflict (slug) do nothing;
-- Memberships are intentionally empty; no inferred product classification.

create function public.admin_create_shop_product(p_product jsonb)
returns public.products
language plpgsql security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_key text;
begin
  if not public.is_shop_admin() then
    raise exception 'Shop administrator required' using errcode = '42501';
  end if;
  if p_product is null or jsonb_typeof(p_product) <> 'object' then
    raise exception 'p_product must be an object' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_product) as k(key)
    where key not in ('id', 'name', 'brand', 'size', 'price_minor', 'currency', 'front_image', 'side_image', 'active', 'description', 'images', 'sizes')
  ) then
    raise exception 'Unknown product field' using errcode = '22023';
  end if;
  foreach v_key in array array['id', 'price_minor'] loop
    if jsonb_typeof(p_product -> v_key) is distinct from 'number'
       or (p_product ->> v_key) !~ '^(0|[1-9][0-9]*)$' then
      raise exception '% must be an explicit integer', v_key using errcode = '22023';
    end if;
  end loop;
  foreach v_key in array array['name', 'brand', 'size', 'front_image', 'side_image'] loop
    if jsonb_typeof(p_product -> v_key) is distinct from 'string'
       or length(btrim(p_product ->> v_key)) = 0 then
      raise exception '% must be a nonempty string', v_key using errcode = '22023';
    end if;
  end loop;
  if p_product ? 'active' and jsonb_typeof(p_product -> 'active') is distinct from 'boolean' then
    raise exception 'active must be a boolean' using errcode = '22023';
  end if;
  if p_product ? 'currency' and (jsonb_typeof(p_product -> 'currency') is distinct from 'string'
      or p_product ->> 'currency' <> 'INR') then
    raise exception 'currency must be INR' using errcode = '22023';
  end if;

  insert into public.products (id, name, brand, size, price_minor, currency, front_image, side_image, active, description, images, sizes)
  values (
    (p_product ->> 'id')::integer, p_product ->> 'name', p_product ->> 'brand',
    p_product ->> 'size', (p_product ->> 'price_minor')::integer,
    coalesce(p_product ->> 'currency', 'INR'), p_product ->> 'front_image',
    p_product ->> 'side_image', coalesce((p_product ->> 'active')::boolean, false),
    coalesce(p_product ->> 'description', ''), coalesce(p_product -> 'images', '[]'::jsonb), coalesce(p_product -> 'sizes', '[]'::jsonb)
  ) returning * into v_product;
  insert into public.inventory_pairs (product_id, state) values (v_product.id, 'unavailable');
  return v_product;
end;
$$;
revoke all on function public.admin_create_shop_product(jsonb) from public, anon, authenticated;
grant execute on function public.admin_create_shop_product(jsonb) to authenticated;

commit;
