-- Everything the standalone quotation page (reference/quotation.html) kept in
-- the browser now lives here:
--   * company state, logo and signature
--   * an editable number prefix per quotation
--   * the company state each quotation was taxed against
--   * a short description per line item
--   * re-saving (overwriting) a quotation that was opened from the saved list
--
-- Additive and safe to re-run. Existing rows get defaults matching what was
-- printed before (prefix SAS/QT/, Kerala).

begin;

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.company_settings
  add column if not exists state_code     text not null default '32',
  add column if not exists logo_path      text,   -- object in the company-assets bucket; null = standard logo
  add column if not exists signature_path text;   -- null = blank space for a wet signature

alter table public.invoices
  add column if not exists number_prefix      text not null default 'SAS/QT/',
  add column if not exists company_state_code text not null default '32';

alter table public.invoice_items
  add column if not exists short_description text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'company_settings_state_code_check') then
    alter table public.company_settings
      add constraint company_settings_state_code_check check (state_code ~ '^[0-9]{2}$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'invoices_company_state_code_check') then
    alter table public.invoices
      add constraint invoices_company_state_code_check check (company_state_code ~ '^[0-9]{2}$');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Re-saving a quotation: creators can update it and replace its items.
-- ---------------------------------------------------------------------------
drop policy if exists "Creators can update their own invoices" on public.invoices;
create policy "Creators can update their own invoices"
  on public.invoices for update
  to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

drop policy if exists "Creators can delete invoice items" on public.invoice_items;
create policy "Creators can delete invoice items"
  on public.invoice_items for delete
  to authenticated
  using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id and i.created_by = (select auth.uid())
    )
  );

-- Updates a quotation and replaces its line items in one transaction, so a
-- failure can't leave it without items. Runs with the caller's permissions:
-- the RLS policies above decide who may do this.
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
    customer_name       = p_invoice->>'customer_name',
    customer_address    = p_invoice->>'customer_address',
    customer_state      = p_invoice->>'customer_state',
    customer_state_code = p_invoice->>'customer_state_code',
    customer_gst        = nullif(p_invoice->>'customer_gst', ''),
    company_state_code  = p_invoice->>'company_state_code',
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

-- ---------------------------------------------------------------------------
-- Logo and signature images (private bucket; PNG/JPEG, under 1 MB)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-assets', 'company-assets', false, 1000000, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "Staff can read company assets" on storage.objects;
create policy "Staff can read company assets"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'company-assets'
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()))
  );

drop policy if exists "Admins can upload company assets" on storage.objects;
create policy "Admins can upload company assets"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'company-assets'
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  );

drop policy if exists "Admins can delete company assets" on storage.objects;
create policy "Admins can delete company assets"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'company-assets'
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  );

commit;
