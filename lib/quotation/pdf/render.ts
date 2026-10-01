import { renderToBuffer } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { companyForInvoice, getCompanyDetails, getCompanyImages, type CompanyDetails } from "@/lib/company";
import { quotationPdfFilename } from "@/lib/quotation/layout";
import type { QuotationRow } from "@/lib/quotation/queries";
import { QuotationDocument } from "./quotation-document";

/**
 * A saved quotation as a PDF, printed with the company details it was saved
 * with. Used by the download route and when emailing it.
 */
export async function renderQuotationPdf(
  supabase: SupabaseClient,
  quotation: QuotationRow,
): Promise<{ pdf: Buffer; filename: string; company: CompanyDetails }> {
  const current = await getCompanyDetails(supabase, { signUrls: false });
  const company = companyForInvoice(quotation.company_snapshot, current);
  const images = await getCompanyImages(supabase, company);
  // QuotationDocument has no hooks; calling it yields the <Document> element
  // that renderToBuffer expects.
  const pdf = await renderToBuffer(QuotationDocument({ quotation, company, images }));
  return { pdf, filename: quotationPdfFilename(quotation.sequence_no, quotation.customer_name), company };
}
