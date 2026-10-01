-- Quotation support, based on reference/current-invoice.pdf.
--
-- Safe to run against existing data and safe to re-run:
--   * columns are added with IF NOT EXISTS; nothing is dropped or renamed
--   * NOT NULL is only used together with a default, so existing rows are
--     backfilled instead of rejected
--   * constraints are only added if they don't already exist
--
-- Kept as-is: invoices.subtotal  = taxable amount
--             invoices.gst_amount = total GST (cgst + sgst + igst)
--             invoice_items.amount = line taxable value (quantity * rate)

begin;

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists document_type       text not null default 'quotation',
  add column if not exists customer_state      text,
  add column if not exists customer_state_code text,
  add column if not exists cgst_amount         numeric(12, 2) not null default 0,
  add column if not exists sgst_amount         numeric(12, 2) not null default 0,
  add column if not exists igst_amount         numeric(12, 2) not null default 0,
  add column if not exists financial_year      text,
  add column if not exists sequence_no         integer,
  add column if not exists payment_terms       text,
  add column if not exists extended_warranty   text,
  add column if not exists delivery_terms      text,
  add column if not exists validity            text;

-- ---------------------------------------------------------------------------
-- invoice_items
-- ---------------------------------------------------------------------------
alter table public.invoice_items
  add column if not exists line_no     integer,
  add column if not exists item_name   text,
  add column if not exists hsn_code    text,
  add column if not exists gst_rate    numeric(5, 2),
  add column if not exists cgst_amount numeric(12, 2) not null default 0,
  add column if not exists sgst_amount numeric(12, 2) not null default 0,
  add column if not exists igst_amount numeric(12, 2) not null default 0,
  add column if not exists line_total  numeric(12, 2) not null default 0;

-- ---------------------------------------------------------------------------
-- Constraints. New nullable columns are NULL on existing rows and the
-- defaulted ones are 0 / 'quotation', so every check passes for them.
-- ---------------------------------------------------------------------------
do $$
begin
  -- Only quotations exist for now; widen this when tax invoices are added.
  if not exists (select 1 from pg_constraint where conname = 'invoices_document_type_check') then
    alter table public.invoices
      add constraint invoices_document_type_check
      check (document_type in ('quotation'));
  end if;

  -- Indian financial year, e.g. 2026-27.
  if not exists (select 1 from pg_constraint where conname = 'invoices_financial_year_check') then
    alter table public.invoices
      add constraint invoices_financial_year_check
      check (financial_year ~ '^[0-9]{4}-[0-9]{2}$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'invoices_sequence_no_check') then
    alter table public.invoices
      add constraint invoices_sequence_no_check
      check (sequence_no > 0);
  end if;

  -- Two-digit GST state code, e.g. 32 (Kerala), 24 (Gujarat).
  if not exists (select 1 from pg_constraint where conname = 'invoices_customer_state_code_check') then
    alter table public.invoices
      add constraint invoices_customer_state_code_check
      check (customer_state_code ~ '^[0-9]{2}$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'invoices_tax_amounts_check') then
    alter table public.invoices
      add constraint invoices_tax_amounts_check
      check (cgst_amount >= 0 and sgst_amount >= 0 and igst_amount >= 0);
  end if;

  -- One number per sequence within a financial year and document type.
  -- Rows with NULLs (e.g. pre-existing rows) don't conflict with each other.
  if not exists (select 1 from pg_constraint where conname = 'invoices_fy_type_seq_key') then
    alter table public.invoices
      add constraint invoices_fy_type_seq_key
      unique (financial_year, document_type, sequence_no);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'invoice_items_line_no_check') then
    alter table public.invoice_items
      add constraint invoice_items_line_no_check
      check (line_no > 0);
  end if;

  -- Line order is unique within an invoice.
  if not exists (select 1 from pg_constraint where conname = 'invoice_items_invoice_line_key') then
    alter table public.invoice_items
      add constraint invoice_items_invoice_line_key
      unique (invoice_id, line_no);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'invoice_items_gst_rate_check') then
    alter table public.invoice_items
      add constraint invoice_items_gst_rate_check
      check (gst_rate >= 0 and gst_rate <= 100);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'invoice_items_tax_amounts_check') then
    alter table public.invoice_items
      add constraint invoice_items_tax_amounts_check
      check (cgst_amount >= 0 and sgst_amount >= 0 and igst_amount >= 0);
  end if;
end;
$$;

commit;
