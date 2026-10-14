begin;

alter table public.products add column if not exists description text not null default '';
alter table public.products add column if not exists images jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists sizes jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists upper_material text not null default '';
alter table public.products add column if not exists sole_material text not null default '';
alter table public.products add column if not exists care_instructions text not null default '';

commit;
