import type { SupabaseClient } from "@supabase/supabase-js";
import { parseHundredths } from "./calc";
import type { Status } from "./status";

export const QUOTATIONS_PAGE_SIZE = 25;

/** Postgres numeric arrives as a JSON number (or string); convert to hundredths/paise. */
export function toHundredths(value: number | string | null | undefined): bigint {
  if (value === null || value === undefined) return BigInt(0);
  return parseHundredths(typeof value === "number" ? value.toFixed(2) : value) ?? BigInt(0);
}

export type QuotationListRow = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  customer_name: string;
  customer_state: string | null;
  subtotal: number | string;
  gst_amount: number | string;
  total_amount: number | string;
  status: Status;
};

export type QuotationItemRow = {
  id: string;
  line_no: number | null;
  item_name: string | null;
  short_description: string | null;
  description: string;
  hsn_code: string | null;
  quantity: number | string;
  rate: number | string;
  gst_rate: number | string | null;
  amount: number | string;
  cgst_amount: number | string;
  sgst_amount: number | string;
  igst_amount: number | string;
  line_total: number | string;
};

export type QuotationRow = QuotationListRow & {
  number_prefix: string;
  financial_year: string | null;
  sequence_no: number | null;
  company_state_code: string;
  /** The company details it was saved with; see companyForInvoice. */
  company_snapshot: unknown;
  /** The saved customer it's linked to, if any. */
  customer_id: string | null;
  customer_address: string;
  customer_gst: string | null;
  customer_state_code: string | null;
  cgst_amount: number | string;
  sgst_amount: number | string;
  igst_amount: number | string;
  payment_terms: string | null;
  extended_warranty: string | null;
  delivery_terms: string | null;
  validity: string | null;
  created_by: string;
  status_changed_at: string | null;
  invoice_items: QuotationItemRow[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Newest first, optionally filtered by quotation number or customer name. */
export async function listQuotations(
  supabase: SupabaseClient,
  { search, page, status }: { search: string; page: number; status?: Status | null },
) {
  const from = (page - 1) * QUOTATIONS_PAGE_SIZE;
  let query = supabase
    .from("invoices")
    .select(
      "id, invoice_number, invoice_date, customer_name, customer_state, subtotal, gst_amount, total_amount, status",
      { count: "exact" },
    )
    .eq("document_type", "quotation")
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + QUOTATIONS_PAGE_SIZE - 1);

  // Strip characters that have meaning in PostgREST filters or LIKE patterns.
  const term = search.replace(/[%_\\,()"*:]/g, " ").trim();
  if (term) {
    query = query.or(`invoice_number.ilike.%${term}%,customer_name.ilike.%${term}%`);
  }
  if (status) query = query.eq("status", status);

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: (data ?? []) as QuotationListRow[], total: count ?? 0 };
}

const QUOTATION_COLUMNS = `id, invoice_number, number_prefix, financial_year, sequence_no, invoice_date,
  customer_id, customer_name, customer_address, customer_gst, customer_state, customer_state_code, company_state_code, company_snapshot,
  subtotal, cgst_amount, sgst_amount, igst_amount, gst_amount, total_amount,
  payment_terms, extended_warranty, delivery_terms, validity, created_by, status, status_changed_at,
  invoice_items (id, line_no, item_name, short_description, description, hsn_code, quantity, rate,
    gst_rate, amount, cgst_amount, sgst_amount, igst_amount, line_total)`;

/** Every quotation with its items, oldest first. Used for the JSON backup. */
export async function listQuotationsForBackup(supabase: SupabaseClient): Promise<QuotationRow[]> {
  // Fetched in pages: the API returns at most 1000 rows per request.
  const PAGE = 500;
  const rows: QuotationRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("invoices")
      .select(QUOTATION_COLUMNS)
      .eq("document_type", "quotation")
      .order("invoice_date", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .order("line_no", { referencedTable: "invoice_items", ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as QuotationRow[]));
    if (!data || data.length < PAGE) return rows;
  }
}

export type DashboardRow = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  customer_id: string | null;
  customer_name: string;
  total_amount: number | string;
  status: Status;
};

/** Quotations dated from `fromDate` (YYYY-MM-DD) on, newest first, for the dashboard. */
export async function listQuotationsSince(supabase: SupabaseClient, fromDate: string): Promise<DashboardRow[]> {
  // Fetched in pages: the API returns at most 1000 rows per request.
  const PAGE = 1000;
  const rows: DashboardRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, customer_id, customer_name, total_amount, status")
      .eq("document_type", "quotation")
      .gte("invoice_date", fromDate)
      .order("invoice_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as DashboardRow[]));
    if (!data || data.length < PAGE) return rows;
  }
}

export async function getQuotation(
  supabase: SupabaseClient,
  id: string,
): Promise<QuotationRow | null> {
  if (!isUuid(id)) return null;

  const { data, error } = await supabase
    .from("invoices")
    .select(QUOTATION_COLUMNS)
    .eq("id", id)
    .eq("document_type", "quotation")
    .order("line_no", { referencedTable: "invoice_items", ascending: true })
    .maybeSingle();

  if (error) throw error;
  return data as QuotationRow | null;
}
