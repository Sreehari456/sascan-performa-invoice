"use server";

import { revalidatePath } from "next/cache";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import {
  COMPANY_ASSETS_BUCKET,
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  companyToInput,
  companyToSnapshot,
  getCompanyDetails,
  rowToCompany,
  validateCompany,
  type CompanyFieldErrors,
  type CompanyImageKind,
  type CompanyInput,
  type CompanySnapshot,
} from "@/lib/company";
import { hundredthsToDecimal } from "@/lib/quotation/calc";
import { getQuotation, isUuid, listQuotationsForBackup, type QuotationRow } from "@/lib/quotation/queries";
import { fetchNextSequenceNo } from "@/lib/quotation/sequence";
import { isFinancialYear, validateQuotation, type FieldErrors, type QuotationInput, type ValidQuotation } from "@/lib/quotation/validate";
import { createClient } from "@/lib/supabase/server";
import { backupEntryToInput, companyToBackup, quotationToBackup, type BackupCompany, type BackupFile } from "./backup";

type Fail = { ok: false; error: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Staff = { supabase: SupabaseClient; userId: string; role: string };

/** The signed-in user's id and role, or an error if they can't use the app. */
async function requireStaff(): Promise<Staff | Fail> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return { ok: false, error: "Your session has expired. Sign in again and retry." };

  const { data: profile, error } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (error) return { ok: false, error: databaseErrorMessage(error) };
  if (!profile) {
    return {
      ok: false,
      error:
        "Your account doesn't have a staff profile yet, so performa invoices can't be saved under your name. Ask an administrator to add your profile.",
    };
  }
  return { supabase, userId, role: profile.role };
}

function isFail(value: Staff | Fail): value is Fail {
  return "ok" in value;
}

/**
 * The saved company details, copied onto each invoice as it's saved. Its state
 * decides CGST + SGST vs IGST. Never taken from the browser.
 */
async function currentCompanySnapshot(supabase: SupabaseClient): Promise<CompanySnapshot> {
  return companyToSnapshot(await getCompanyDetails(supabase, { signUrls: false }));
}

/**
 * Saves the invoice's customer to the shared customer list: updates the
 * picked customer (customerId), or the one with the same name, or adds a new
 * one. Returns its id, or null if that fails: the invoice is saved anyway,
 * since it keeps its own copy of the customer fields.
 */
async function rememberCustomer(
  supabase: SupabaseClient,
  customerId: string | null,
  q: ValidQuotation,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("remember_customer", {
    p_id: customerId && isUuid(customerId) ? customerId : null,
    p_name: q.customerName,
    p_address: q.customerAddress,
    p_gstin: q.customerGstin ?? "",
    p_state_code: q.customerStateCode,
    p_state: q.customerState,
  });
  if (error) {
    console.error("Failed to remember customer:", error);
    return null;
  }
  return (data as string | null) ?? null;
}

function toRecords(q: ValidQuotation, company: CompanySnapshot, customerId: string | null) {
  const money = hundredthsToDecimal;
  const invoice = {
    invoice_number: q.invoiceNumber,
    number_prefix: q.numberPrefix,
    financial_year: q.financialYear,
    sequence_no: q.sequenceNo,
    invoice_date: q.quotationDate,
    customer_id: customerId,
    customer_name: q.customerName,
    customer_address: q.customerAddress,
    customer_state: q.customerState,
    customer_state_code: q.customerStateCode,
    customer_gst: q.customerGstin,
    company_state_code: q.companyStateCode,
    company_snapshot: company,
    subtotal: money(q.totals.taxable),
    cgst_amount: money(q.totals.cgst),
    sgst_amount: money(q.totals.sgst),
    igst_amount: money(q.totals.igst),
    gst_amount: money(q.totals.cgst + q.totals.sgst + q.totals.igst),
    total_amount: money(q.totals.total),
    payment_terms: q.paymentTerms,
    extended_warranty: q.extendedWarranty,
    delivery_terms: q.deliveryTerms,
    validity: q.validity,
  };
  const items = q.items.map((item, i) => ({
    line_no: i + 1,
    item_name: item.itemName,
    short_description: item.shortDescription,
    description: item.description,
    hsn_code: item.hsnCode,
    quantity: money(item.quantity),
    rate: money(item.rate),
    gst_rate: money(item.gstRate),
    amount: money(item.amounts.taxable),
    cgst_amount: money(item.amounts.cgst),
    sgst_amount: money(item.amounts.sgst),
    igst_amount: money(item.amounts.igst),
    line_total: money(item.amounts.total),
  }));
  return { invoice, items };
}

type InsertResult = { ok: true; id: string } | { ok: false; conflict: true } | { ok: false; conflict?: false; error: PostgrestError };

async function insertQuotation(
  supabase: SupabaseClient,
  userId: string,
  q: ValidQuotation,
  company: CompanySnapshot,
  customerId: string | null,
): Promise<InsertResult> {
  const { invoice, items } = toRecords(q, company, customerId);
  const { data, error } = await supabase
    .from("invoices")
    .insert({ ...invoice, document_type: "quotation", created_by: userId })
    .select("id")
    .single();
  if (error?.code === "23505") return { ok: false, conflict: true };
  if (error) return { ok: false, error };

  const { error: itemsError } = await supabase
    .from("invoice_items")
    .insert(items.map((item) => ({ ...item, invoice_id: data.id })));
  if (itemsError) {
    // Don't leave a quotation without its items behind.
    await supabase.from("invoices").delete().eq("id", data.id);
    return { ok: false, error: itemsError };
  }
  return { ok: true, id: data.id };
}

async function takenMessage(supabase: SupabaseClient, q: ValidQuotation): Promise<string> {
  const next = await fetchNextSequenceNo(supabase, q.financialYear).catch(() => null);
  return `${q.invoiceNumber} is already used.${next ? ` The next free number is ${String(next).padStart(3, "0")}.` : ""}`;
}

function databaseErrorMessage(error: PostgrestError): string {
  if (error.code === "42501") {
    return "You don't have permission to do that. The database access policies may not have been applied yet.";
  }
  if (error.code === "42P01" || error.code === "42703" || error.code === "PGRST202" || error.code === "PGRST204") {
    return "The database is missing the latest changes. Apply the newest Supabase migrations and try again.";
  }
  console.error("Quotation database error:", error);
  return "Something went wrong while saving. Please try again.";
}

function revalidateQuotations() {
  // Re-renders the form (its "Saved" list and customer suggestions) and the
  // saved list, view and customer pages.
  revalidatePath("/dashboard", "layout");
}

// ---------------------------------------------------------------------------
// Quotations
// ---------------------------------------------------------------------------

export type SaveQuotationResult =
  | { ok: true; id: string; number: string; customerId: string | null }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

/**
 * Saves the quotation in the form. With `id` (a quotation opened from the
 * saved list) it's overwritten; otherwise a new one is created.
 */
export async function saveQuotation(
  input: QuotationInput,
  id: string | null,
  customerId: string | null,
): Promise<SaveQuotationResult> {
  const staff = await requireStaff();
  if (isFail(staff)) return staff;
  const { supabase, userId } = staff;

  const company = await currentCompanySnapshot(supabase);
  const result = validateQuotation(input, company.stateCode);
  if (!result.ok) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: result.errors };
  }
  const q = result.data;
  const linkedCustomerId = await rememberCustomer(supabase, customerId, q);

  if (id) {
    if (!isUuid(id)) return { ok: false, error: "Invalid performa invoice." };
    const { invoice, items } = toRecords(q, company, linkedCustomerId);
    const { error } = await supabase.rpc("update_quotation", { p_id: id, p_invoice: invoice, p_items: items });
    if (error?.code === "23505") {
      const message = await takenMessage(supabase, q);
      return { ok: false, error: message, fieldErrors: { sequenceNo: message } };
    }
    if (error?.code === "42501" || error?.code === "P0001") {
      return {
        ok: false,
        error: "Only the person who created this performa invoice can change it. Use New to save it as a new one.",
      };
    }
    if (error) return { ok: false, error: databaseErrorMessage(error) };
    revalidateQuotations();
    return { ok: true, id, number: q.invoiceNumber, customerId: linkedCustomerId };
  }

  const inserted = await insertQuotation(supabase, userId, q, company, linkedCustomerId);
  if (!inserted.ok) {
    if (inserted.conflict) {
      const message = await takenMessage(supabase, q);
      return { ok: false, error: message, fieldErrors: { sequenceNo: message } };
    }
    return { ok: false, error: databaseErrorMessage(inserted.error) };
  }
  revalidateQuotations();
  return { ok: true, id: inserted.id, number: q.invoiceNumber, customerId: linkedCustomerId };
}

/** A saved quotation, for loading back into the form. */
export async function openQuotation(id: string): Promise<{ ok: true; quotation: QuotationRow } | Fail> {
  const supabase = await createClient();
  try {
    const quotation = await getQuotation(supabase, id);
    if (!quotation) return { ok: false, error: "That performa invoice no longer exists." };
    return { ok: true, quotation };
  } catch (error) {
    return { ok: false, error: databaseErrorMessage(error as PostgrestError) };
  }
}

/** Deletes a quotation; RLS only lets its creator do this. Items go with it (ON DELETE CASCADE). */
export async function removeQuotation(id: string): Promise<{ ok: true } | Fail> {
  if (!isUuid(id)) return { ok: false, error: "Invalid performa invoice." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .delete()
    .eq("id", id)
    .eq("document_type", "quotation")
    .select("id");
  if (error) return { ok: false, error: databaseErrorMessage(error) };
  if (!data || data.length === 0) {
    return { ok: false, error: "Only the person who created this performa invoice can delete it." };
  }
  revalidateQuotations();
  return { ok: true };
}

/** The next free "No." in a financial year. */
export async function nextSequenceNo(financialYear: string): Promise<{ ok: true; sequenceNo: number } | Fail> {
  if (!isFinancialYear(financialYear)) return { ok: false, error: "Invalid financial year." };
  const supabase = await createClient();
  try {
    return { ok: true, sequenceNo: await fetchNextSequenceNo(supabase, financialYear) };
  } catch (error) {
    return { ok: false, error: databaseErrorMessage(error as PostgrestError) };
  }
}

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

/** Every quotation plus the company details, in the standalone page's backup format. */
export async function exportBackup(): Promise<{ ok: true; backup: BackupFile } | Fail> {
  const staff = await requireStaff();
  if (isFail(staff)) return staff;
  try {
    const [rows, company] = await Promise.all([
      listQuotationsForBackup(staff.supabase),
      getCompanyDetails(staff.supabase),
    ]);
    return {
      ok: true,
      backup: {
        company: companyToBackup(company),
        history: rows.reverse().map(quotationToBackup), // newest first, like the standalone page
        exported: new Date().toISOString(),
      },
    };
  } catch (error) {
    return { ok: false, error: databaseErrorMessage(error as PostgrestError) };
  }
}

export type ImportResult =
  | {
      ok: true;
      imported: number;
      skipped: number;
      failed: { number: string; reason: string }[];
      /** The company details now saved, if the backup's replaced them. */
      company: CompanyInput | null;
    }
  | Fail;

/**
 * Adds the backup's quotations that don't exist yet (matched by number) and,
 * if asked, replaces the company details. Accepts files exported here and
 * from the standalone quotation page. Images in the backup aren't imported.
 */
export async function importBackup(backup: BackupFile, replaceCompany: boolean): Promise<ImportResult> {
  const staff = await requireStaff();
  if (isFail(staff)) return staff;
  const { supabase, userId } = staff;

  if (!backup || !Array.isArray(backup.history)) {
    return { ok: false, error: "That file is not a valid backup." };
  }

  let updatedCompany: CompanyInput | null = null;
  if (replaceCompany && backup.company) {
    const saved = await saveCompanyDetails(backupCompanyToInput(backup.company));
    if (!saved.ok) return { ok: false, error: `Company details weren't imported: ${saved.error}` };
    updatedCompany = saved.values;
  }

  const company = await currentCompanySnapshot(supabase);
  let imported = 0;
  let skipped = 0;
  const failed: { number: string; reason: string }[] = [];

  for (const entry of backup.history) {
    const number = typeof entry?.number === "string" ? entry.number : "(no number)";
    const result = validateQuotation(backupEntryToInput(entry), company.stateCode);
    if (!result.ok) {
      failed.push({ number, reason: Object.values(result.errors)[0] ?? "Invalid data." });
      continue;
    }
    const inserted = await insertQuotation(
      supabase,
      userId,
      result.data,
      company,
      await rememberCustomer(supabase, null, result.data),
    );
    if (inserted.ok) imported++;
    else if (inserted.conflict) skipped++;
    else failed.push({ number, reason: databaseErrorMessage(inserted.error) });
  }

  if (imported > 0) revalidateQuotations();
  return { ok: true, imported, skipped, failed, company: updatedCompany };
}

function backupCompanyToInput(c: BackupCompany): CompanyInput {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    name: s(c.coName),
    address: s(c.coAddr),
    mobile: s(c.coMob),
    email: s(c.coEmail),
    gstin: s(c.coGstin),
    stateCode: s(c.coState),
    bankName: s(c.bkName),
    accountNumber: s(c.bkAcc),
    ifsc: s(c.bkIfsc),
    bankBranch: s(c.bkBranch),
  };
}

// ---------------------------------------------------------------------------
// Company details (admins only)
// ---------------------------------------------------------------------------

export type SaveCompanyResult = { ok: true; values: CompanyInput } | (Fail & { fieldErrors?: CompanyFieldErrors });

async function requireAdmin(): Promise<Staff | Fail> {
  const staff = await requireStaff();
  if (isFail(staff)) return staff;
  if (staff.role !== "admin") return { ok: false, error: "Only administrators can change the company details." };
  return staff;
}

/** Saves the company details printed on every performa invoice. */
export async function saveCompanyDetails(input: CompanyInput): Promise<SaveCompanyResult> {
  const staff = await requireAdmin();
  if (isFail(staff)) return staff;

  const result = validateCompany(input);
  if (!result.ok) {
    return { ok: false, error: "Please fix the highlighted company details.", fieldErrors: result.errors };
  }

  const { data, error } = await staff.supabase
    .from("company_settings")
    .update({ ...result.row, updated_by: staff.userId })
    .eq("id", true)
    .select("id");
  if (error) return { ok: false, error: databaseErrorMessage(error) };
  // RLS hides the row from non-admins, so nothing is updated rather than an error.
  if (!data || data.length === 0) {
    return { ok: false, error: "The company details couldn't be saved. You may not have permission to change them." };
  }

  // Saved performa invoices and their PDFs print these details too.
  revalidatePath("/dashboard", "layout");
  return { ok: true, values: companyToInput(rowToCompany(result.row)) };
}

const IMAGE_COLUMN = { logo: "logo_path", signature: "signature_path" } as const;

/** Uploads a new logo or signature (PNG/JPEG under 900 KB) and returns its display URL. */
export async function uploadCompanyImage(
  kind: CompanyImageKind,
  formData: FormData,
): Promise<{ ok: true; url: string | null; path: string } | Fail> {
  if (kind !== "logo" && kind !== "signature") return { ok: false, error: "Unknown image." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an image." };
  if (!IMAGE_TYPES.includes(file.type)) return { ok: false, error: "Use a PNG or JPEG image." };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Image too large — use one under 900 KB." };

  const staff = await requireAdmin();
  if (isFail(staff)) return staff;
  const { supabase } = staff;
  const storage = supabase.storage.from(COMPANY_ASSETS_BUCKET);

  // A new name each time, so cached copies of the old image are never shown.
  const path = `${kind}-${Date.now()}.${file.type === "image/png" ? "png" : "jpg"}`;
  const { error: uploadError } = await storage.upload(path, file, { contentType: file.type });
  if (uploadError) {
    console.error("Company image upload failed:", uploadError);
    return { ok: false, error: "The image couldn't be uploaded. Please try again." };
  }

  const { error } = await supabase
    .from("company_settings")
    .update({ [IMAGE_COLUMN[kind]]: path, updated_by: staff.userId })
    .eq("id", true);
  if (error) {
    await storage.remove([path]);
    return { ok: false, error: databaseErrorMessage(error) };
  }
  // The previous image is kept: invoices saved with it still print it.

  const { data: signed } = await storage.createSignedUrl(path, 60 * 60);
  revalidatePath("/dashboard", "layout");
  return { ok: true, url: signed?.signedUrl ?? null, path };
}

/** Removes the logo (back to the standard Sascan logo) or the signature. */
export async function removeCompanyImage(kind: CompanyImageKind): Promise<{ ok: true } | Fail> {
  if (kind !== "logo" && kind !== "signature") return { ok: false, error: "Unknown image." };
  const staff = await requireAdmin();
  if (isFail(staff)) return staff;
  const { supabase } = staff;

  // The file itself is kept: invoices saved with it still print it.
  const { error } = await supabase
    .from("company_settings")
    .update({ [IMAGE_COLUMN[kind]]: null, updated_by: staff.userId })
    .eq("id", true);
  if (error) return { ok: false, error: databaseErrorMessage(error) };

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
