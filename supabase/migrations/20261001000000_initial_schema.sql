-- Initial schema: profiles, invoices, invoice_items.
-- RLS is enabled on every table. No policies are defined yet, so the
-- publishable (anon) key can read/write nothing until policies are added.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null,
  email       text not null,
  role        text not null check (role in ('admin', 'accounts')),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------
create table public.invoices (
  id                uuid primary key default gen_random_uuid(),
  invoice_number    text not null unique,
  invoice_date      date not null,
  customer_name     text not null,
  customer_address  text not null,
  customer_gst      text,
  subtotal          numeric(12, 2) not null,
  gst_amount        numeric(12, 2) not null,
  total_amount      numeric(12, 2) not null,
  pdf_path          text,
  created_by        uuid not null references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index invoices_created_by_idx on public.invoices (created_by);

-- ---------------------------------------------------------------------------
-- invoice_items
-- ---------------------------------------------------------------------------
create table public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices (id) on delete cascade,
  description text not null,
  quantity    numeric(10, 2) not null,
  rate        numeric(12, 2) not null,
  amount      numeric(12, 2) not null,
  created_at  timestamptz not null default now()
);

create index invoice_items_invoice_id_idx on public.invoice_items (invoice_id);

-- ---------------------------------------------------------------------------
-- Keep invoices.updated_at current on every update
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.invoices      enable row level security;
alter table public.invoice_items enable row level security;
