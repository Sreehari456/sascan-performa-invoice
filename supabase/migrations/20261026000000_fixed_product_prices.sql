-- Fixed product prices. A product with fixed_rate = true has a price nobody
-- can change from the app: invoice items with its name must use its rate, and
-- the product's rate and name can't be changed, nor the product deleted.
-- To change such a price later, run SQL here (as the database owner):
--   update public.products set fixed_rate = false where lower(name) = 'oralscan';
--   update public.products set rate = <new price> where lower(name) = 'oralscan';
--   update public.products set fixed_rate = true where lower(name) = 'oralscan';
--
-- OralScan is fixed at Rs 7,50,000. Invoices already saved keep the price
-- they were issued with (they are only checked when saved again).
--
-- Safe to re-run.

begin;

alter table public.products
  add column if not exists fixed_rate boolean not null default false;

-- OralScan at 750000, fixed. Created if missing.
insert into public.products (name, short_description, description, hsn_code, rate, gst_rate)
values (
  'OralScan',
  'Hand-held Imaging System',
  E'with\na. Probe Holder\nb. Calibration Stand with Tissue Phantom\nc. Warranty for 2 year\nd. Laptop with Digital Pen for RoI marking and Windows10 installed\ne. OralView intra oral 2MPx camera for taking the image with 1 year warranty\nf. Carry case\ng. OralScan software with cloud support',
  '90189099',
  750000,
  5
)
on conflict ((lower(name))) do nothing;

-- Unlock first so the trigger below (on re-runs) allows setting the price.
update public.products set fixed_rate = false where lower(name) = 'oralscan';
update public.products set rate = 750000, fixed_rate = true where lower(name) = 'oralscan';

-- ---------------------------------------------------------------------------
-- Products: a fixed product's rate and name can't change, and it can't be deleted.
-- Unlocking (fixed_rate true -> false) is only possible as the database owner,
-- e.g. in the Supabase SQL editor; app users can't.
-- ---------------------------------------------------------------------------
create or replace function public.protect_fixed_products()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.fixed_rate then
      raise exception '% has a fixed price and can''t be deleted.', old.name using errcode = 'P0001';
    end if;
    return old;
  end if;

  if old.fixed_rate then
    if current_user in ('authenticated', 'anon') and not new.fixed_rate then
      raise exception '% has a fixed price that can''t be unlocked.', old.name using errcode = 'P0001';
    end if;
    if new.fixed_rate and (new.rate <> old.rate or lower(new.name) <> lower(old.name)) then
      raise exception '% has a fixed price of Rs %; it can''t be changed.', old.name, old.rate using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists products_protect_fixed on public.products;
create trigger products_protect_fixed
  before update or delete on public.products
  for each row
  execute function public.protect_fixed_products();

-- ---------------------------------------------------------------------------
-- Invoice items: an item named like a fixed product must use its rate.
-- Runs as the table owner so it can always read the product list.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_fixed_item_rates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_rate numeric;
begin
  select p.name, p.rate into v_name, v_rate
  from public.products p
  where p.fixed_rate and lower(p.name) = lower(btrim(coalesce(new.item_name, '')));

  if v_rate is not null and new.rate <> v_rate then
    raise exception '% has a fixed price of Rs %.', v_name, v_rate using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists invoice_items_enforce_fixed_rates on public.invoice_items;
create trigger invoice_items_enforce_fixed_rates
  before insert or update on public.invoice_items
  for each row
  execute function public.enforce_fixed_item_rates();

commit;
