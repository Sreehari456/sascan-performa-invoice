"use server";

import { revalidatePath } from "next/cache";
import type { PostgrestError } from "@supabase/supabase-js";
import { validateCustomer, type CustomerFieldErrors, type CustomerInput, type CustomerRow } from "@/lib/customers";
import { isUuid } from "@/lib/quotation/queries";
import { createClient } from "@/lib/supabase/server";

type Fail = { ok: false; error: string; fieldErrors?: CustomerFieldErrors };

function errorMessage(error: PostgrestError): string {
  if (error.code === "23505") return "Another customer already has this name.";
  if (error.code === "42501") return "You don't have permission to change customers.";
  if (error.code === "42P01") return "The customers table doesn't exist yet. Apply the latest database migration.";
  console.error("Customer database error:", error);
  return "Something went wrong. Please try again.";
}

/**
 * Updates a saved customer. Performa invoices already issued keep the details
 * they were saved with; only new ones use the change.
 */
export async function updateCustomer(id: string, input: CustomerInput): Promise<{ ok: true; customer: CustomerRow } | Fail> {
  if (!isUuid(id)) return { ok: false, error: "Invalid customer." };
  const result = validateCustomer(input);
  if (!result.ok) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: result.errors };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .update(result.data)
    .eq("id", id)
    .select("id, name, address, gstin, state_code, state, email");
  if (error) {
    const message = errorMessage(error);
    return { ok: false, error: message, fieldErrors: error.code === "23505" ? { name: message } : undefined };
  }
  if (!data || data.length === 0) return { ok: false, error: "This customer no longer exists." };

  revalidatePath("/dashboard", "layout");
  return { ok: true, customer: data[0] as CustomerRow };
}

/** Deletes a saved customer. Their performa invoices are kept, just unlinked. */
export async function deleteCustomer(id: string): Promise<{ ok: true } | Fail> {
  if (!isUuid(id)) return { ok: false, error: "Invalid customer." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("customers").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: errorMessage(error) };
  if (!data || data.length === 0) return { ok: false, error: "This customer couldn't be deleted." };

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
