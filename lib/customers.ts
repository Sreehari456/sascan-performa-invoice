import type { SupabaseClient } from "@supabase/supabase-js";
import { findState } from "@/lib/quotation/states";
import { GSTIN_PATTERN, normaliseGstin } from "@/lib/quotation/validate";

// Saved customers (public.customers), shared by all staff. Remembered when a
// performa invoice is saved and suggested in the invoice form.

export type CustomerRow = {
  id: string;
  name: string;
  address: string;
  /** null = unregistered (URP). */
  gstin: string | null;
  state_code: string;
  state: string;
  /** Remembered from the first email sent to them. */
  email: string | null;
};

export type CustomerListRow = CustomerRow & { invoice_count: number };

const COLUMNS = "id, name, address, gstin, state_code, state, email";
const MAX_CUSTOMERS = 2000;

/** Every customer, by name. Small enough to send to the form for instant suggestions. */
export async function listCustomers(supabase: SupabaseClient): Promise<CustomerRow[]> {
  const { data, error } = await supabase
    .from("customers")
    .select(COLUMNS)
    .order("name", { ascending: true })
    .limit(MAX_CUSTOMERS);
  if (error) throw error;
  return (data ?? []) as CustomerRow[];
}

/** Customers with how many performa invoices each has, optionally filtered by name or GSTIN. */
export async function listCustomersWithCounts(supabase: SupabaseClient, search: string): Promise<CustomerListRow[]> {
  let query = supabase
    .from("customers")
    .select(`${COLUMNS}, invoices(count)`)
    .order("name", { ascending: true })
    .limit(MAX_CUSTOMERS);

  // Strip characters that have meaning in PostgREST filters or LIKE patterns.
  const term = search.replace(/[%_\\,()"*:]/g, " ").trim();
  if (term) query = query.or(`name.ilike.%${term}%,gstin.ilike.%${term}%`);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => {
    const { invoices, ...rest } = row as CustomerRow & { invoices: { count: number }[] };
    return { ...rest, invoice_count: invoices?.[0]?.count ?? 0 };
  });
}

/** Saved customers matching what's typed: names starting with it first, then names containing it. */
export function matchCustomers(customers: CustomerRow[], query: string, limit = 8): CustomerRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts: CustomerRow[] = [];
  const contains: CustomerRow[] = [];
  for (const c of customers) {
    const name = c.name.toLowerCase();
    if (name.startsWith(q)) starts.push(c);
    else if (name.includes(q) || c.gstin?.toLowerCase().includes(q)) contains.push(c);
  }
  return [...starts, ...contains].slice(0, limit);
}

export type CustomerInput = {
  name: string;
  address: string;
  gstin: string;
  stateCode: string;
  email: string;
};

export type CustomerFieldErrors = Partial<Record<keyof CustomerInput, string>>;

export type ValidCustomer = {
  name: string;
  address: string;
  gstin: string | null;
  state_code: string;
  state: string;
  email: string | null;
};

export function validateCustomer(
  raw: CustomerInput,
): { ok: true; data: ValidCustomer } | { ok: false; errors: CustomerFieldErrors } {
  const errors: CustomerFieldErrors = {};
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

  const name = text(raw?.name);
  if (!name) errors.name = "Enter the customer name.";
  else if (name.length > 200) errors.name = "Keep the name under 200 characters.";

  const address = text(raw?.address);
  if (address.length > 1000) errors.address = "The address is too long.";

  const gstinRaw = normaliseGstin(text(raw?.gstin));
  let gstin: string | null = null;
  if (gstinRaw && gstinRaw !== "URP") {
    if (GSTIN_PATTERN.test(gstinRaw)) gstin = gstinRaw;
    else errors.gstin = "Enter a valid 15-character GSTIN, or leave blank for URP.";
  }

  const state = findState(text(raw?.stateCode));
  if (!state) errors.stateCode = "Select the customer's state.";

  const email = text(raw?.email).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address, or leave it blank.";

  if (Object.keys(errors).length > 0 || !state) return { ok: false, errors };
  return { ok: true, data: { name, address, gstin, state_code: state.code, state: state.name, email: email || null } };
}
