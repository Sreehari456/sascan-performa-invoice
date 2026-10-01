-- Saved customers, shared by all staff. Remembered automatically when a
-- performa invoice is saved and offered as suggestions in the form.
-- Invoices keep their own copy of the customer fields (customer_name etc.);
-- customer_id only links them, so editing or deleting a customer never
-- changes an invoice already issued.
--
-- Additive and safe to re-run.

begin;

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  address     text not null default '',
  gstin       text,                       -- null = unregistered (URP)
  state_code  text not null check (state_code ~ '^[0-9]{2}$'),
  state       text not null,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One customer per name, ignoring case.
create unique index if not exists customers_name_key on public.customers (lower(name));

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
  before update on public.customers
  for each row
  execute function public.set_updated_at();

alter table public.invoices
  add column if not exists customer_id uuid references public.customers (id) on delete set null;

create index if not exists invoices_customer_id_idx on public.invoices (customer_id);

-- ---------------------------------------------------------------------------
-- Backfill from existing invoices: one customer per name, with the details
-- from that customer's most recent invoice.
-- ---------------------------------------------------------------------------
insert into public.customers (name, address, gstin, state_code, state, created_by, created_at)
select distinct on (lower(btrim(i.customer_name)))
  btrim(i.customer_name),
  i.customer_address,
  i.customer_gst,
  i.customer_state_code,
  coalesce(i.customer_state, ''),
  i.created_by,
  i.created_at
from public.invoices i
where i.customer_state_code is not null
  and length(btrim(i.customer_name)) > 0
order by lower(btrim(i.customer_name)), i.invoice_date desc, i.created_at desc
on conflict ((lower(name))) do nothing;

update public.invoices i
set customer_id = c.id
from public.customers c
where i.customer_id is null
  and lower(btrim(i.customer_name)) = lower(c.name);

-- ---------------------------------------------------------------------------
-- Row Level Security: a shared list every staff member can use and maintain.
-- ---------------------------------------------------------------------------
alter table public.customers enable row level security;

drop policy if exists "Staff can read customers" on public.customers;
create policy "Staff can read customers"
  on public.customers for select
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid())));

drop policy if exists "Staff can add customers" on public.customers;
create policy "Staff can add customers"
  on public.customers for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()))
  );

drop policy if exists "Staff can update customers" on public.customers;
create policy "Staff can update customers"
  on public.customers for update
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid())))
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid())));

drop policy if exists "Staff can delete customers" on public.customers;
create policy "Staff can delete customers"
  on public.customers for delete
  to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- remember_customer: called when an invoice is saved. Updates the picked
-- customer (p_id), or the one with the same name, or creates a new one.
-- Returns the customer's id.
-- ---------------------------------------------------------------------------
create or replace function public.remember_customer(
  p_id uuid,
  p_name text,
  p_address text,
  p_gstin text,
  p_state_code text,
  p_state text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_id is not null then
    begin
      update public.customers
      set name = btrim(p_name), address = p_address, gstin = nullif(p_gstin, ''),
          state_code = p_state_code, state = p_state
      where id = p_id
      returning id into v_id;
    exception when unique_violation then
      v_id := null; -- renamed to another customer's name: fall through to that one
    end;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  insert into public.customers (name, address, gstin, state_code, state, created_by)
  values (btrim(p_name), p_address, nullif(p_gstin, ''), p_state_code, p_state, (select auth.uid()))
  on conflict ((lower(name))) do update
    set address = excluded.address, gstin = excluded.gstin,
        state_code = excluded.state_code, state = excluded.state
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.remember_customer(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.remember_customer(uuid, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- update_quotation: now also stores the invoice's customer link.
-- ---------------------------------------------------------------------------
create or replace function public.update_quotation(p_id uuid, p_invoice jsonb, p_items jsonb)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_number text;
begin
  update public.invoices set
    invoice_number      = p_invoice->>'invoice_number',
    number_prefix       = p_invoice->>'number_prefix',
    financial_year      = p_invoice->>'financial_year',
    sequence_no         = (p_invoice->>'sequence_no')::integer,
    invoice_date        = (p_invoice->>'invoice_date')::date,
    customer_id         = nullif(p_invoice->>'customer_id', '')::uuid,
    customer_name       = p_invoice->>'customer_name',
    customer_address    = p_invoice->>'customer_address',
    customer_state      = p_invoice->>'customer_state',
    customer_state_code = p_invoice->>'customer_state_code',
    customer_gst        = nullif(p_invoice->>'customer_gst', ''),
    company_state_code  = p_invoice->>'company_state_code',
    company_snapshot    = p_invoice->'company_snapshot',
    subtotal            = (p_invoice->>'subtotal')::numeric,
    cgst_amount         = (p_invoice->>'cgst_amount')::numeric,
    sgst_amount         = (p_invoice->>'sgst_amount')::numeric,
    igst_amount         = (p_invoice->>'igst_amount')::numeric,
    gst_amount          = (p_invoice->>'gst_amount')::numeric,
    total_amount        = (p_invoice->>'total_amount')::numeric,
    payment_terms       = p_invoice->>'payment_terms',
    extended_warranty   = p_invoice->>'extended_warranty',
    delivery_terms      = p_invoice->>'delivery_terms',
    validity            = p_invoice->>'validity'
  where id = p_id
    and document_type = 'quotation'
    and created_by = (select auth.uid())
  returning invoice_number into v_number;

  if v_number is null then
    raise exception 'Quotation not found, or you did not create it.' using errcode = '42501';
  end if;

  delete from public.invoice_items where invoice_id = p_id;

  insert into public.invoice_items (
    invoice_id, line_no, item_name, short_description, description, hsn_code,
    quantity, rate, gst_rate, amount, cgst_amount, sgst_amount, igst_amount, line_total
  )
  select
    p_id, x.line_no, x.item_name, x.short_description, x.description, x.hsn_code,
    x.quantity, x.rate, x.gst_rate, x.amount, x.cgst_amount, x.sgst_amount, x.igst_amount, x.line_total
  from jsonb_to_recordset(p_items) as x(
    line_no integer, item_name text, short_description text, description text, hsn_code text,
    quantity numeric, rate numeric, gst_rate numeric, amount numeric,
    cgst_amount numeric, sgst_amount numeric, igst_amount numeric, line_total numeric
  );

  return v_number;
end;
$$;

revoke execute on function public.update_quotation(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.update_quotation(uuid, jsonb, jsonb) to authenticated;

commit;
