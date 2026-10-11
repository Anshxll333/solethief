begin;

-- Preserve the four existing public route IDs and display values exactly.
-- Seed is intentionally insert-only: never reset operator-edited catalog or stock.
insert into public.products (id, name, brand, size, price_minor, currency, front_image, side_image, active) values
  (1, 'MEXICO 66 FIRE', 'SOLETHIEF TIGER', 'US 9', 1900000, 'INR', '/shoes/transparent/shoe-1-front.png', '/shoes/transparent/shoe-1-side.png', true),
  (2, 'TRASPIK', 'SOLETHIEF VAPOR', 'US 9', 1850000, 'INR', '/shoes/transparent/shoe-2-front.png', '/shoes/transparent/shoe-2-side.png', true),
  (3, 'SCLAW', 'SOLETHIEF RONIN', 'US 10', 1650000, 'INR', '/shoes/transparent/shoe-3-front.png', '/shoes/transparent/shoe-3-side.png', true),
  (4, 'SCLAW', 'SOLETHIEF RONIN', 'US 8', 1650000, 'INR', '/shoes/transparent/shoe-4-front.png', '/shoes/transparent/shoe-4-side.png', true)
on conflict (id) do nothing;

-- Existing display data does not establish verified physical stock.
insert into public.inventory_pairs (product_id, state) values
  (1, 'unavailable'), (2, 'unavailable'), (3, 'unavailable'), (4, 'unavailable')
on conflict (product_id) do nothing;

commit;
