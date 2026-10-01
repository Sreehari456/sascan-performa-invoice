"use server";

import { revalidatePath } from "next/cache";
import type { PostgrestError } from "@supabase/supabase-js";
import { validateProduct, type ProductFieldErrors, type ProductInput } from "@/lib/products";
import { isUuid } from "@/lib/quotation/queries";
import { createClient } from "@/lib/supabase/server";

type Fail = { ok: false; error: string; fieldErrors?: ProductFieldErrors };

function errorMessage(error: PostgrestError): string {
  if (error.code === "23505") return "Another product already has this name.";
  if (error.code === "42501") return "You don't have permission to change products.";
  if (error.code === "42P01" || error.code === "PGRST202") {
    return "The products table doesn't exist yet. Apply the latest database migration.";
  }
  console.error("Product database error:", error);
  return "Something went wrong. Please try again.";
}

function fail(error: PostgrestError): Fail {
  const message = errorMessage(error);
  return { ok: false, error: message, fieldErrors: error.code === "23505" ? { name: message } : undefined };
}

function invalid(errors: ProductFieldErrors): Fail {
  return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: errors };
}

/** The signed-in user's id, required to add products. */
async function signedIn() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, userId: data?.claims?.sub ?? null };
}

export async function createProduct(input: ProductInput): Promise<{ ok: true } | Fail> {
  const result = validateProduct(input);
  if (!result.ok) return invalid(result.errors);

  const { supabase, userId } = await signedIn();
  if (!userId) return { ok: false, error: "Your session has expired. Sign in again and retry." };
  const { error } = await supabase.from("products").insert({ ...result.data, created_by: userId });
  if (error) return fail(error);

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/** Invoices already saved keep their own copy of the item, so they don't change. */
export async function updateProduct(id: string, input: ProductInput): Promise<{ ok: true } | Fail> {
  if (!isUuid(id)) return { ok: false, error: "Invalid product." };
  const result = validateProduct(input);
  if (!result.ok) return invalid(result.errors);

  const { supabase } = await signedIn();
  const { data, error } = await supabase.from("products").update(result.data).eq("id", id).select("id");
  if (error) return fail(error);
  if (!data || data.length === 0) return { ok: false, error: "This product no longer exists." };

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function deleteProduct(id: string): Promise<{ ok: true } | Fail> {
  if (!isUuid(id)) return { ok: false, error: "Invalid product." };
  const { supabase } = await signedIn();
  const { data, error } = await supabase.from("products").delete().eq("id", id).select("id");
  if (error) return fail(error);
  if (!data || data.length === 0) return { ok: false, error: "This product couldn't be deleted." };

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/** "Save to products" from an invoice item: updates the product with that name, or adds it. */
export async function saveItemAsProduct(input: ProductInput): Promise<{ ok: true; name: string } | Fail> {
  const result = validateProduct(input);
  if (!result.ok) return invalid(result.errors);

  const { supabase } = await signedIn();
  const p = result.data;
  const { error } = await supabase.rpc("save_product", {
    p_name: p.name,
    p_short_description: p.short_description,
    p_description: p.description,
    p_hsn_code: p.hsn_code ?? "",
    p_rate: p.rate,
    p_gst_rate: p.gst_rate,
  });
  if (error) return fail(error);

  // Re-renders the invoice form, so the new product shows in its suggestions.
  revalidatePath("/dashboard", "layout");
  return { ok: true, name: p.name };
}
