import type { SupabaseClient } from "@supabase/supabase-js";
import { hundredthsToDecimal, parseHundredths } from "@/lib/quotation/calc";
import { toHundredths } from "@/lib/quotation/queries";

// Saved products (public.products), shared by all staff. Picked when adding an
// item to a proforma invoice; saved on purpose, never from an invoice save.

export type ProductRow = {
  id: string;
  name: string;
  short_description: string;
  description: string;
  hsn_code: string | null;
  rate: number | string;
  gst_rate: number | string;
};

const COLUMNS = "id, name, short_description, description, hsn_code, rate, gst_rate";
const MAX_PRODUCTS = 2000;

/** Every product, by name, optionally filtered by name or HSN code. */
export async function listProducts(supabase: SupabaseClient, search = ""): Promise<ProductRow[]> {
  let query = supabase.from("products").select(COLUMNS).order("name", { ascending: true }).limit(MAX_PRODUCTS);

  // Strip characters that have meaning in PostgREST filters or LIKE patterns.
  const term = search.replace(/[%_\\,()"*:]/g, " ").trim();
  if (term) query = query.or(`name.ilike.%${term}%,hsn_code.ilike.%${term}%,short_description.ilike.%${term}%`);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ProductRow[];
}

/** Products matching what's typed: names starting with it first, then names containing it. */
export function matchProducts(products: ProductRow[], query: string, limit = 8): ProductRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts: ProductRow[] = [];
  const contains: ProductRow[] = [];
  for (const p of products) {
    const name = p.name.toLowerCase();
    if (name.startsWith(q)) starts.push(p);
    else if (name.includes(q) || p.short_description.toLowerCase().includes(q)) contains.push(p);
  }
  return [...starts, ...contains].slice(0, limit);
}

/** "730000.00" -> "730000", "2.50" -> "2.5": how numbers are typed in the form. */
export function plainDecimal(value: number | string | null): string {
  return hundredthsToDecimal(toHundredths(value)).replace(/\.?0+$/, "");
}

/** Form fields, as typed. Same names as an invoice line item. */
export type ProductInput = {
  name: string;
  shortDescription: string;
  description: string;
  hsnCode: string;
  rate: string;
  gstRate: string;
};

export type ProductFieldErrors = Partial<Record<keyof ProductInput, string>>;

export type ValidProduct = {
  name: string;
  short_description: string;
  description: string;
  hsn_code: string | null;
  rate: string;
  gst_rate: string;
};

export function productToInput(p: ProductRow): ProductInput {
  return {
    name: p.name,
    shortDescription: p.short_description,
    description: p.description,
    hsnCode: p.hsn_code ?? "",
    rate: plainDecimal(p.rate),
    gstRate: plainDecimal(p.gst_rate),
  };
}

const MAX_RATE = BigInt("999999999999"); // numeric(12,2) in paise
const MAX_GST_RATE = BigInt(10000); // 100%

export function validateProduct(
  raw: ProductInput,
): { ok: true; data: ValidProduct } | { ok: false; errors: ProductFieldErrors } {
  const errors: ProductFieldErrors = {};
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

  const name = text(raw?.name);
  if (!name) errors.name = "Enter the product name.";
  else if (name.length > 200) errors.name = "Keep the name under 200 characters.";

  const shortDescription = text(raw?.shortDescription);
  if (shortDescription.length > 300) errors.shortDescription = "Keep it under 300 characters.";

  const description = text(raw?.description);
  if (description.length > 4000) errors.description = "This is too long.";

  const hsnCode = text(raw?.hsnCode);
  if (hsnCode && !/^[0-9]{4,8}$/.test(hsnCode)) errors.hsnCode = "HSN code must be 4–8 digits.";

  const rate = parseHundredths(text(raw?.rate));
  if (rate === null) errors.rate = "Enter a valid rate (up to 2 decimals).";
  else if (rate > MAX_RATE) errors.rate = "The rate is too large.";

  const gstRate = parseHundredths(text(raw?.gstRate));
  if (gstRate === null || gstRate > MAX_GST_RATE) errors.gstRate = "Enter a GST rate between 0 and 100.";

  if (Object.keys(errors).length > 0 || rate === null || gstRate === null) return { ok: false, errors };
  return {
    ok: true,
    data: {
      name,
      short_description: shortDescription,
      description,
      hsn_code: hsnCode || null,
      rate: hundredthsToDecimal(rate),
      gst_rate: hundredthsToDecimal(gstRate),
    },
  };
}

/** Whether an item as typed is the same as the saved product (so there's nothing to save). */
export function itemMatchesProduct(item: ProductInput, product: ProductRow): boolean {
  const saved = productToInput(product);
  const same = (a: string, b: string) => a.trim() === b.trim();
  const sameNumber = (a: string, b: string) => parseHundredths(a.trim()) === parseHundredths(b);
  return (
    same(item.name, saved.name) &&
    same(item.shortDescription, saved.shortDescription) &&
    same(item.description, saved.description) &&
    same(item.hsnCode, saved.hsnCode) &&
    sameNumber(item.rate, saved.rate) &&
    sameNumber(item.gstRate, saved.gstRate)
  );
}
