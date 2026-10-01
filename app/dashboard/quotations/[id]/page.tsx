import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DOCUMENT_TITLE, pageTitle } from "@/lib/branding";
import { companyForInvoice, getCompanyDetails, signCompanyImages, type CompanyDetails } from "@/lib/company";
import { emailConfigured } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";
import { formatQuotationDate, formatRupees } from "@/lib/quotation/format";
import { quotationPdfFilename } from "@/lib/quotation/layout";
import { getQuotation, toHundredths, type QuotationRow } from "@/lib/quotation/queries";
import { statusOf } from "@/lib/quotation/status";
import { DeleteQuotationButton } from "./delete-quotation-button";
import { DownloadPdfButton } from "./download-pdf-button";
import { EmailButton } from "./email-button";
import { QuotationPreview } from "./quotation-preview";
import { StatusControl } from "./status-control";

export const metadata: Metadata = {
  title: pageTitle("Performa invoice"),
};

type SentEmail = { id: string; to_email: string; cc_email: string | null; sent_at: string; profiles: { name: string } | null };

export default async function QuotationPage({ params, searchParams }: PageProps<"/dashboard/quotations/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const justSaved = query.created === "1";
  const autoDownload = query.download === "1";

  const supabase = await createClient();
  const [quotation, currentCompany, { data: auth }] = await Promise.all([
    getQuotation(supabase, id),
    getCompanyDetails(supabase, { signUrls: false }),
    supabase.auth.getClaims(),
  ]);
  if (!quotation) notFound();
  const userId = auth?.claims?.sub ?? "";

  const [company, { data: customer }, { data: emails }, { data: me }] = await Promise.all([
    // Printed with the company details it was saved with, not today's.
    signCompanyImages(supabase, companyForInvoice(quotation.company_snapshot, currentCompany)),
    quotation.customer_id
      ? supabase.from("customers").select("email").eq("id", quotation.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("invoice_emails")
      .select("id, to_email, cc_email, sent_at, profiles(name)")
      .eq("invoice_id", quotation.id)
      .order("sent_at", { ascending: false })
      .limit(20),
    supabase.from("profiles").select("name").eq("id", userId).maybeSingle(),
  ]);

  const canDelete = userId === quotation.created_by;
  const filename = quotationPdfFilename(quotation.sequence_no, quotation.customer_name);
  const sentEmails = (emails ?? []) as unknown as SentEmail[];

  return (
    <div className="space-y-5">
      {justSaved && (
        <div role="status" className="rounded-[10px] border border-[#c7dec5] bg-brand-soft px-4 py-3 text-sm text-brand-ink">
          Performa invoice <b>{quotation.invoice_number}</b> was saved
          {autoDownload ? " — your PDF is downloading." : "."}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <Link href="/dashboard/quotations" className="text-[13px] font-semibold text-brand hover:text-brand-ink">
            ← Saved performa invoices
          </Link>
          <h1 className="text-xl font-bold tracking-[-0.025em] sm:text-2xl">{quotation.invoice_number}</h1>
          <p className="text-[13px] text-muted">
            {quotation.customer_name} · {formatQuotationDate(quotation.invoice_date)} · ₹
            {formatRupees(toHundredths(quotation.total_amount))}
          </p>
        </div>

        <div className="flex flex-wrap items-start gap-2">
          <DownloadPdfButton id={quotation.id} filename={filename} autoStart={autoDownload} />
          <EmailButton
            id={quotation.id}
            configured={emailConfigured()}
            defaultTo={(customer as { email: string | null } | null)?.email ?? ""}
            defaultSubject={`${DOCUMENT_TITLE} ${quotation.invoice_number} from ${company.name}`}
            defaultMessage={defaultMessage(quotation, company, (me as { name: string } | null)?.name ?? "")}
            attachmentName={filename}
            canRememberEmail={Boolean(quotation.customer_id)}
          />
          {canDelete ? (
            <Link
              href={`/dashboard/quotations/new?edit=${quotation.id}`}
              className="rounded-lg border border-line bg-transparent px-4 py-2 text-sm font-semibold text-ink hover:border-ink hover:bg-soft"
            >
              Edit
            </Link>
          ) : (
            <button
              type="button"
              disabled
              title="Only the person who created this performa invoice can edit it."
              className="cursor-not-allowed rounded-lg border border-line bg-transparent px-4 py-2 text-sm font-semibold text-ink opacity-50"
            >
              Edit
            </button>
          )}
          <DeleteQuotationButton id={quotation.id} quotationNumber={quotation.invoice_number} canDelete={canDelete} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line bg-white px-4 py-3">
        {/* Keyed on the saved status, so it follows changes made elsewhere (e.g. emailing marks it sent). */}
        <StatusControl key={quotation.status} id={quotation.id} status={statusOf(quotation.status)} />
        {quotation.status_changed_at && (
          <span className="text-xs text-muted">Status changed {formatWhen(quotation.status_changed_at)}</span>
        )}
      </div>

      {sentEmails.length > 0 && (
        <details className="rounded-[10px] border border-line bg-white px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold">
            Emailed {sentEmails.length} {sentEmails.length === 1 ? "time" : "times"} · last {formatWhen(sentEmails[0].sent_at)}
          </summary>
          <ul className="mt-2 divide-y divide-line">
            {sentEmails.map((e) => (
              <li key={e.id} className="py-2 text-[13px]">
                <span className="text-ink">To {e.to_email}</span>
                {e.cc_email && <span className="text-muted"> · CC {e.cc_email}</span>}
                <span className="block text-xs text-muted">
                  {formatWhen(e.sent_at)}
                  {e.profiles?.name ? ` by ${e.profiles.name}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <QuotationPreview quotation={quotation} company={company} />
    </div>
  );
}

function defaultMessage(q: QuotationRow, company: CompanyDetails, senderName: string): string {
  return [
    "Dear Sir/Madam,",
    "",
    `Please find attached our ${DOCUMENT_TITLE.toLowerCase()} ${q.invoice_number} dated ${formatQuotationDate(q.invoice_date)}, for a total of Rs. ${formatRupees(toHundredths(q.total_amount))} (including GST).`,
    "",
    "Please let us know if you have any questions.",
    "",
    "Regards,",
    ...(senderName ? [senderName] : []),
    company.name,
    company.mobile,
  ].join("\n");
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}
