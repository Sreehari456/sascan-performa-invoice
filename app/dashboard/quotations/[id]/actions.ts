"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { emailConfigured, sendEmail } from "@/lib/email";
import { renderQuotationPdf } from "@/lib/quotation/pdf/render";
import { getQuotation, isUuid } from "@/lib/quotation/queries";
import { isStatus, type Status } from "@/lib/quotation/status";
import { createClient } from "@/lib/supabase/server";

/**
 * Deletes a quotation. RLS only allows the creator to delete it; its
 * invoice_items are removed by the ON DELETE CASCADE foreign key.
 */
export async function deleteQuotation(id: string): Promise<{ error: string }> {
  if (!isUuid(id)) return { error: "Invalid performa invoice." };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) {
    return { error: "Your session has expired. Sign in again and retry." };
  }

  const { data, error } = await supabase
    .from("invoices")
    .delete()
    .eq("id", id)
    .eq("document_type", "quotation")
    .select("invoice_number");

  if (error) {
    console.error("Failed to delete quotation:", error);
    return { error: "The performa invoice couldn't be deleted. Please try again." };
  }
  // RLS filters out rows the user may not delete, so nothing is deleted
  // rather than an error being raised.
  if (!data || data.length === 0) {
    return {
      error: "This performa invoice couldn't be deleted. Only the person who created it can delete it.",
    };
  }

  redirect(`/dashboard/quotations?deleted=${encodeURIComponent(data[0].invoice_number)}`);
}

/** Moves a quotation to another status. Any staff member can do this. */
export async function setQuotationStatus(
  id: string,
  status: string,
): Promise<{ ok: true; status: Status } | { ok: false; error: string }> {
  if (!isUuid(id)) return { ok: false, error: "Invalid performa invoice." };
  if (!isStatus(status)) return { ok: false, error: "Unknown status." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_quotation_status", { p_id: id, p_status: status });
  if (error) {
    console.error("Failed to change status:", error);
    return {
      ok: false,
      error: error.code === "PGRST202" ? "Apply the latest database migration first." : "The status couldn't be changed.",
    };
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true, status: isStatus(data) ? data : status };
}

export type EmailInput = {
  to: string;
  cc: string;
  subject: string;
  message: string;
  sendMeCopy: boolean;
  saveToCustomer: boolean;
};

export type EmailResult =
  | { ok: true; status: Status }
  | { ok: false; error: string; field?: "to" | "cc" | "subject" | "message" };

const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const MAX_RECIPIENTS = 5;

/** "a@x.in, b@y.com; c@z.org" -> addresses, or null if any is invalid. */
function parseAddresses(value: string): string[] | null {
  const list = value
    .split(/[,;\s]+/)
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  return list.every((a) => EMAIL_PATTERN.test(a)) ? [...new Set(list)] : null;
}

/**
 * Emails the quotation's PDF to the customer, records it, and marks a draft
 * as sent. Replies go to the company email printed on the quotation.
 */
export async function sendQuotationEmail(id: string, input: EmailInput): Promise<EmailResult> {
  if (!isUuid(id)) return { ok: false, error: "Invalid performa invoice." };
  if (!emailConfigured()) {
    return { ok: false, error: "Email isn't set up yet. Ask an administrator to add RESEND_API_KEY and EMAIL_FROM." };
  }

  const to = parseAddresses(input.to ?? "");
  if (!to || to.length === 0) return { ok: false, error: "Enter the customer's email address.", field: "to" };
  const cc = parseAddresses(input.cc ?? "");
  if (!cc) return { ok: false, error: "One of the CC addresses isn't valid.", field: "cc" };
  if (to.length + cc.length > MAX_RECIPIENTS) {
    return { ok: false, error: `Send to at most ${MAX_RECIPIENTS} addresses at once.`, field: "to" };
  }
  const subject = (input.subject ?? "").trim();
  if (!subject || subject.length > 200) {
    return { ok: false, error: "Enter a subject (under 200 characters).", field: "subject" };
  }
  const message = (input.message ?? "").trim();
  if (!message || message.length > 5000) return { ok: false, error: "Enter a message.", field: "message" };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  const myEmail = typeof auth?.claims?.email === "string" ? auth.claims.email.toLowerCase() : null;
  if (!userId) return { ok: false, error: "Your session has expired. Sign in again and retry." };

  const quotation = await getQuotation(supabase, id).catch(() => null);
  if (!quotation) return { ok: false, error: "This performa invoice no longer exists." };

  let rendered;
  try {
    rendered = await renderQuotationPdf(supabase, quotation);
  } catch (error) {
    console.error("Failed to render PDF for email:", error);
    return { ok: false, error: "The PDF couldn't be generated." };
  }

  const ccAll = [...cc];
  if (input.sendMeCopy && myEmail && !to.includes(myEmail) && !ccAll.includes(myEmail)) ccAll.push(myEmail);

  const sent = await sendEmail({
    to,
    cc: ccAll,
    replyTo: rendered.company.email || myEmail || undefined,
    subject,
    text: message,
    attachments: [{ filename: rendered.filename, content: rendered.pdf }],
  });
  if (!sent.ok) return { ok: false, error: sent.error };

  // The email is out; record-keeping below shouldn't turn that into an error.
  const { error: logError } = await supabase.from("invoice_emails").insert({
    invoice_id: id,
    to_email: to.join(", "),
    cc_email: ccAll.length ? ccAll.join(", ") : null,
    subject,
    provider_message_id: sent.id,
    sent_by: userId,
  });
  if (logError) console.error("Failed to record sent email:", logError);

  if (input.saveToCustomer && quotation.customer_id) {
    const { error: customerError } = await supabase
      .from("customers")
      .update({ email: to[0] })
      .eq("id", quotation.customer_id);
    if (customerError) console.error("Failed to save customer email:", customerError);
  }

  const { data: status, error: statusError } = await supabase.rpc("set_quotation_status", {
    p_id: id,
    p_status: "sent",
    p_only_if_draft: true,
  });
  if (statusError) console.error("Failed to mark quotation as sent:", statusError);

  revalidatePath("/dashboard", "layout");
  return { ok: true, status: isStatus(status) ? status : quotation.status };
}
