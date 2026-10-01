-- Saved products (the product list), shared by all staff. Picked when adding
-- an item to a performa invoice. Unlike customers, products are only saved on
-- purpose ("Save to products" or the Products page): a rate given on one
-- quotation shouldn't silently change the list price.
-- Invoice items keep their own copy of every field, so editing or deleting a
-- product never changes an invoice already issued.
--
-- Additive and safe to re-run.

begin;

create table if not exists public.products (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (length(btrim(name)) > 0),
  short_description text not null default '',
  description       text not null default '',  -- included items, one per line
  hsn_code          text check (hsn_code ~ '^[0-9]{4,8}$'),
  rate              numeric(12, 2) not null check (rate >= 0),
  gst_rate          numeric(5, 2) not null default 5 check (gst_rate >= 0 and gst_rate <= 100),
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- One product per name, ignoring case.
create unique index if not exists products_name_key on public.products (lower(name));

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Backfill: one product per item name already used on an invoice, with the
-- details from its most recent use.
-- ---------------------------------------------------------------------------
insert into public.products (name, short_description, description, hsn_code, rate, gst_rate, created_by, created_at)
select distinct on (lower(btrim(it.item_name)))
  btrim(it.item_name),
  coalesce(it.short_description, ''),
  it.description,
  case when it.hsn_code ~ '^[0-9]{4,8}$' then it.hsn_code end,
  it.rate,
  coalesce(it.gst_rate, 5),
  i.created_by,
  i.created_at
from public.invoice_items it
join public.invoices i on i.id = it.invoice_id
where length(btrim(coalesce(it.item_name, ''))) > 0
order by lower(btrim(it.item_name)), i.invoice_date desc, i.created_at desc
on conflict ((lower(name))) do nothing;

-- The product on quotation SAS/QT/2026-27/045, if it isn't there already.
insert into public.products (name, short_description, description, hsn_code, rate, gst_rate)
values (
  'OralScan',
  'Hand-held Imaging System',
  E'with\na. Probe Holder\nb. Calibration Stand with Tissue Phantom\nc. Warranty for 2 year\nd. Laptop with Digital Pen for RoI marking and Windows10 installed\ne. OralView intra oral 2MPx camera for taking the image with 1 year warranty\nf. Carry case\ng. OralScan software with cloud support',
  '90189099',
  730000,
  5
)
on conflict ((lower(name))) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security: a shared list every staff member can use and maintain.
-- ---------------------------------------------------------------------------
alter table public.products enable row level security;

drop policy if exists "Staff can read products" on public.products;
create policy "Staff can read products"
  on public.products for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid())));

drop policy if exists "Staff can add products" on public.products;
create policy "Staff can add products"
  on public.products for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()))
  );

drop policy if exists "Staff can update products" on public.products;
create policy "Staff can update products"
  on public.products for update
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid())))
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid())));

drop policy if exists "Staff can delete products" on public.products;
create policy "Staff can delete products"
  on public.products for delete
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- save_product: "Save to products" from an invoice item. Updates the product
-- with the same name, or adds a new one. Returns its id.
-- ---------------------------------------------------------------------------
create or replace function public.save_product(
  p_name text,
  p_short_description text,
  p_description text,
  p_hsn_code text,
  p_rate numeric,
  p_gst_rate numeric
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.products (name, short_description, description, hsn_code, rate, gst_rate, created_by)
  values (btrim(p_name), p_short_description, p_description, nullif(p_hsn_code, ''), p_rate, p_gst_rate, (select auth.uid()))
  on conflict ((lower(name))) do update
    set short_description = excluded.short_description, description = excluded.description,
        hsn_code = excluded.hsn_code, rate = excluded.rate, gst_rate = excluded.gst_rate
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.save_product(text, text, text, text, numeric, numeric) from public, anon;
grant execute on function public.save_product(text, text, text, text, numeric, numeric) to authenticated;

commit;
