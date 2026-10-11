-- Run as postgres against a disposable LOCAL Supabase database after migrations.
-- psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/tests/shop_categories.sql
begin;

create function pg_temp.assert_true(ok boolean, label text) returns void
language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', label; end if;
end;
$$;
create function pg_temp.expect_error(statement text, expected_state text) returns void
language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = expected_state then return; end if;
    raise exception 'Expected %, got %: %', expected_state, sqlstate, sqlerrm;
  end;
  raise exception 'Expected % but statement succeeded: %', expected_state, statement;
end;
$$;

insert into auth.users (id) values ('a1100000-0000-4000-8000-000000000001');
insert into public.admin_roles(user_id) values ('a1100000-0000-4000-8000-000000000001');
insert into public.products(id, name, brand, size, price_minor, front_image, side_image, active) values
  (2147483601, 'Test active', 'Test', '9', 100, '/a.png', '/b.png', true),
  (2147483602, 'Test inactive', 'Test', '9', 100, '/a.png', '/b.png', false);
insert into public.shop_categories(id, name, slug, is_visible) values
  ('c1100000-0000-4000-8000-000000000001', 'Test visible', 'test-visible', true),
  ('c1100000-0000-4000-8000-000000000002', 'Test hidden', 'test-hidden', false);
insert into public.shop_category_products values
  ('c1100000-0000-4000-8000-000000000001', 2147483601),
  ('c1100000-0000-4000-8000-000000000001', 2147483602),
  ('c1100000-0000-4000-8000-000000000002', 2147483601);

set local role anon;
select set_config('request.jwt.claims', '{}', true);
select pg_temp.assert_true(not public.is_shop_admin(), 'anon admin false');
select pg_temp.assert_true((select count(*) = 1 from public.shop_categories where slug like 'test-%'), 'anon visible categories');
select pg_temp.assert_true((select count(*) = 1 from public.shop_category_products where product_id >= 2147483601), 'anon visible active memberships');
select pg_temp.expect_error($q$insert into public.shop_categories(name, slug) values ('Denied', 'denied')$q$, '42501');
select pg_temp.expect_error('select * from public.admin_roles', '42501');
select pg_temp.expect_error($q$select public.admin_create_shop_product('{}')$q$, '42501');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select pg_temp.assert_true(not public.is_shop_admin(), 'customer admin false');
select pg_temp.assert_true((select count(*) = 1 from public.shop_category_products where product_id >= 2147483601), 'customer visible active memberships');
select pg_temp.expect_error($q$insert into public.shop_categories(name, slug) values ('Denied', 'denied')$q$, '42501');
select pg_temp.expect_error($q$insert into public.shop_category_products values ('c1100000-0000-4000-8000-000000000002',2147483602)$q$, '42501');
with changed as (update public.shop_categories set name = 'Denied' where slug = 'test-visible' returning *)
select pg_temp.assert_true((select count(*) = 0 from changed), 'customer update filtered');
with removed as (delete from public.shop_category_products where product_id >= 2147483601 returning *)
select pg_temp.assert_true((select count(*) = 0 from removed), 'customer delete filtered');
select pg_temp.expect_error($q$select public.admin_create_shop_product('{}')$q$, '42501');

select set_config('request.jwt.claims', '{"sub":"a1100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.assert_true(public.is_shop_admin(), 'admin true');
select pg_temp.assert_true((select count(*) = 2 from public.products where id >= 2147483601), 'admin inactive reads');
select pg_temp.assert_true((select count(*) = 3 from public.shop_category_products where product_id >= 2147483601), 'admin all memberships');
insert into public.shop_categories(name, slug, image_url) values ('Admin created', 'test-created', 'https://example.com/image.png');
update public.shop_categories set name = 'Admin renamed', image_url = '/shoes/a.png' where slug = 'test-created';
insert into public.shop_category_products values ('c1100000-0000-4000-8000-000000000002',2147483602);
delete from public.shop_categories where slug = 'test-hidden';
select pg_temp.assert_true((select count(*) = 2 from public.shop_category_products where product_id >= 2147483601), 'category cascade membership only');
select pg_temp.assert_true((select count(*) = 2 from public.products where id >= 2147483601), 'category deletion preserves products');
select pg_temp.expect_error('select * from public.admin_roles', '42501');
select pg_temp.expect_error('select * from public.inventory_pairs', '42501');
select pg_temp.expect_error($q$update public.orders set status = 'cancelled'$q$, '42501');
select pg_temp.expect_error($q$update public.shop_categories set slug = 'changed' where slug = 'test-visible'$q$, '42501');

select public.admin_create_shop_product('{"id":2147483603,"name":"RPC pair","brand":"Test","size":"9","price_minor":100,"front_image":"/a.png","side_image":"/b.png"}');
select pg_temp.expect_error($q$select public.admin_create_shop_product('{"id":2147483603,"name":"Conflict","brand":"Test","size":"9","price_minor":100,"front_image":"/a.png","side_image":"/b.png"}')$q$, '23505');
select pg_temp.expect_error($q$select public.admin_create_shop_product('{"name":"Missing ID"}')$q$, '22023');

reset role;
select pg_temp.assert_true((select state = 'unavailable' from public.inventory_pairs where product_id = 2147483603), 'RPC unavailable inventory');
select pg_temp.assert_true((select not active and name = 'RPC pair' from public.products where id = 2147483603), 'RPC defaults and no upsert');
select pg_temp.expect_error('delete from public.products where id = 2147483601', '23503');
select pg_temp.expect_error($q$update public.shop_categories set slug = 'changed' where slug = 'test-visible'$q$, '23514');

do $$
declare bad text;
begin
  foreach bad in array array['//evil.com/a', 'http://example.com/a', 'https://u:p@example.com/a', '/a%2fb', '/a%5cb', '/a%0ab', '/a' || chr(92) || 'b', '/a' || chr(10) || 'b', ''] loop
    perform pg_temp.expect_error(format('insert into public.shop_categories(name, slug, image_url) values (%L, %L, %L)', 'Bad', 'test-bad-image', bad), '23514');
  end loop;
end;
$$;

-- Force failure on the second write to prove product insertion rolls back too.
create function pg_temp.reject_test_inventory() returns trigger language plpgsql as $$
begin
  if new.product_id = 2147483604 then raise exception 'Injected inventory failure' using errcode = '23514'; end if;
  return new;
end;
$$;
create trigger test_inventory_failure before insert on public.inventory_pairs
for each row execute function pg_temp.reject_test_inventory();
set local role authenticated;
select pg_temp.expect_error($q$select public.admin_create_shop_product('{"id":2147483604,"name":"Rollback","brand":"Test","size":"9","price_minor":100,"front_image":"/a.png","side_image":"/b.png"}')$q$, '23514');
reset role;
select pg_temp.assert_true(not exists(select 1 from public.products where id = 2147483604), 'atomic product rollback');
select pg_temp.assert_true(not exists(select 1 from public.inventory_pairs where product_id = 2147483604), 'atomic inventory rollback');

rollback;
