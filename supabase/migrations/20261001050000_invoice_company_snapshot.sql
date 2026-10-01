-- Each performa invoice keeps a copy of the company details it was saved with,
-- so later changes (new bank account, new address, new logo) don't alter
-- invoices already issued. The app prints invoices.company_snapshot and only
-- falls back to company_settings for rows that have none.
--
-- Shape: { "v": 1, "name", "addressLines": [..], "mobile", "email", "gstin",
--          "stateCode", "bank": { "bank", "accountNumber", "ifsc", "branch" },
--          "logoPath", "signaturePath" }
--
-- Additive and safe to re-run.

begin;

alter table public.invoices
  add column if not exists company_snapshot jsonb;

-- Existing invoices: the best record of what they printed is the current
-- company details, with the state they were actually taxed against.
update public.invoices i
set company_snapshot = jsonb_build_object(
  'v', 1,
  'name', c.name,
  'addressLines', to_jsonb(array_remove(string_to_array(c.address, E'\n'), '')),
  'mobile', c.mobile,
  'email', c.email,
  'gstin', c.gstin,
  'stateCode', i.company_state_code,
  'bank', jsonb_build_object(
    'bank', c.bank_name,
    'accountNumber', c.account_number,
    'ifsc', c.ifsc,
    'branch', c.bank_branch
  ),
  'logoPath', c.logo_path,
  'signaturePath', c.signature_path
)
from public.company_settings c
where i.company_snapshot is null;

-- Re-saving an opened quotation also refreshes its copy of the company details.
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
