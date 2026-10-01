import Image from "next/image";
import { DOCUMENT_TITLE } from "@/lib/branding";
import { COMPANY_LOGO, type CompanyDetails } from "@/lib/company";
import { amountInWords, formatQuantity, formatQuotationDate, formatRupees } from "@/lib/quotation/format";
import { COLUMN_WIDTHS, amountOrBlank, amountOrDash, lineTaxRates } from "@/lib/quotation/layout";
import { toHundredths, type QuotationRow } from "@/lib/quotation/queries";

const base = "border border-black px-1 py-0.5";
const cell = `${base} align-top`;
const num = `${cell} text-right tabular-nums`;
// Item rows: values are vertically centred against the description, as on the reference.
const mid = `${base} align-middle`;
const midNum = `${mid} text-right tabular-nums`;
const centred = `${cell} text-center tabular-nums`;

/**
 * On-screen reproduction of the reference quotation layout.
 * Amounts are the stored values, not recalculated.
 */
export function QuotationPreview({ quotation, company }: { quotation: QuotationRow; company: CompanyDetails }) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-line bg-paper p-4 sm:p-6">
      <QuotationPaper quotation={quotation} company={company} className="mx-auto min-w-[760px] max-w-[960px]" />
    </div>
  );
}

/** The quotation sheet itself, without the surrounding card. */
export function QuotationPaper({
  quotation: q,
  company,
  className = "",
}: {
  quotation: QuotationRow;
  company: CompanyDetails;
  className?: string;
}) {
  const total = toHundredths(q.total_amount);

  return (
    <article
      aria-label={`${DOCUMENT_TITLE} ${q.invoice_number}`}
      className={`${className} bg-white border border-black font-[Arial,Helvetica,sans-serif] text-[11px] leading-snug text-black`}
    >
      {/* Company header */}
      <header className="relative px-4 pt-3 pb-2 text-center">
        {company.logoUrl ? (
          // Signed Supabase Storage URL of the uploaded logo.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={company.logoUrl}
            alt={`${company.name} logo`}
            className="absolute left-5 top-4 max-h-[46px] max-w-[180px] object-contain"
          />
        ) : (
          <Image
            src={COMPANY_LOGO.src}
            width={COMPANY_LOGO.width}
            height={COMPANY_LOGO.height}
            alt="Sascan — Saving Lives"
            className="absolute left-5 top-4 h-auto w-[150px]"
            priority
          />
        )}
        <p className="text-[28px] italic leading-tight">{DOCUMENT_TITLE}</p>
        <h2 className="text-[22px] font-bold leading-tight">{company.name}</h2>
        {company.addressLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <p className="font-bold">
          Mob : {company.mobile}
          <span className="ml-4">Email : {company.email}</span>
        </p>
        <p>GSTIN- {company.gstin}</p>
      </header>

      <table className="w-full table-fixed border-collapse">
        <colgroup>
          {COLUMN_WIDTHS.map((width, i) => (
            <col key={i} style={{ width: `${width}%` }} />
          ))}
        </colgroup>
        <tbody>
          {/* Customer and quotation details */}
          <tr>
            <td colSpan={4} className={cell}>
              <p className="font-bold">To,</p>
              <p className="font-bold">{q.customer_name}</p>
              <p className="whitespace-pre-line font-bold">{q.customer_address}</p>
              {q.customer_state_code && (
                <p className="font-bold">
                  State Code : {q.customer_state_code}
                  {q.customer_state ? ` (${q.customer_state})` : ""}
                </p>
              )}
            </td>
            <td colSpan={2} className={cell}>
              <p className="font-bold">GSTIN:</p>
              <p className="font-bold">{q.customer_gst ?? "URP"}</p>
            </td>
            <td colSpan={3} className={`${cell} text-center`}>
              <p className="font-bold">{DOCUMENT_TITLE} No.</p>
              <p className="font-bold">{q.invoice_number}</p>
            </td>
            <td colSpan={3} className={`${cell} text-right`}>
              <p className="font-bold">Dated</p>
              <p className="font-bold">{formatQuotationDate(q.invoice_date)}</p>
            </td>
          </tr>

          {/* Line-item header */}
          <tr className="font-bold">
            <th rowSpan={2} className={`${cell} text-left`}>Item</th>
            <th rowSpan={2} className={`${cell} text-left`}>HSN Code</th>
            <th rowSpan={2} className={cell}>Qty</th>
            <th rowSpan={2} className={cell}>Rate</th>
            <th rowSpan={2} className={cell}>Taxable Value (Rs.)</th>
            <th colSpan={2} className={cell}>CGST</th>
            <th colSpan={2} className={cell}>SGST</th>
            <th colSpan={2} className={cell}>IGST</th>
            <th rowSpan={2} className={`${cell} text-right`}>Total (₹)</th>
          </tr>
          <tr className="font-bold">
            <th className={cell}>Rate</th>
            <th className={cell}>Amount</th>
            <th className={cell}>Rate</th>
            <th className={cell}>Amount</th>
            <th className={cell}>Rate</th>
            <th className={cell}>Amount</th>
          </tr>

          {/* Line items */}
          {q.invoice_items.map((item, index) => {
            const rates = lineTaxRates(item.gst_rate, q.customer_state_code, q.company_state_code);
            return (
              <tr key={item.id}>
                <td className={cell}>
                  <p>
                    <span className="font-bold">
                      {item.line_no ?? index + 1}. {item.item_name}
                    </span>
                    {item.short_description && ` - ${item.short_description}`}
                  </p>
                  {item.description && <p className="whitespace-pre-line">{item.description}</p>}
                </td>
                <td className={mid}>{item.hsn_code}</td>
                <td className={`${midNum} font-bold`}>{formatQuantity(toHundredths(item.quantity))}</td>
                <td className={midNum}>{formatRupees(toHundredths(item.rate))}</td>
                <td className={midNum}>{formatRupees(toHundredths(item.amount))}</td>
                <td className={`${mid} text-center`}>{rates.cgst}</td>
                <td className={midNum}>{amountOrBlank(toHundredths(item.cgst_amount))}</td>
                <td className={`${mid} text-center`}>{rates.sgst}</td>
                <td className={midNum}>{amountOrBlank(toHundredths(item.sgst_amount))}</td>
                <td className={`${mid} text-center`}>{rates.igst}</td>
                <td className={midNum}>{amountOrBlank(toHundredths(item.igst_amount))}</td>
                <td className={midNum}>{formatRupees(toHundredths(item.line_total))}</td>
              </tr>
            );
          })}

          {/* Column totals */}
          <tr className="font-bold">
            <td colSpan={4} className={`${cell} text-center`}>Total</td>
            <td className={num}>{formatRupees(toHundredths(q.subtotal))}</td>
            <td className={cell} />
            <td className={centred}>{amountOrDash(toHundredths(q.cgst_amount))}</td>
            <td className={cell} />
            <td className={centred}>{amountOrDash(toHundredths(q.sgst_amount))}</td>
            <td className={cell} />
            <td className={num}>{amountOrDash(toHundredths(q.igst_amount))}</td>
            <td className={num}>{formatRupees(total)}</td>
          </tr>

          {/* Tax breakdown */}
          {[
            ["Taxable Amount", formatRupees(toHundredths(q.subtotal))],
            ["CGST", amountOrDash(toHundredths(q.cgst_amount))],
            ["SGST", amountOrDash(toHundredths(q.sgst_amount))],
            ["IGST", amountOrDash(toHundredths(q.igst_amount))],
            ["Total", formatRupees(total)],
          ].map(([label, value]) => (
            <tr key={label} className="font-bold">
              <td colSpan={9} className={`${cell} text-right`}>{label}</td>
              <td colSpan={3} className={num}>{value}</td>
            </tr>
          ))}

          {/* Amount in words + signatory */}
          <tr>
            <td colSpan={6} className={cell}>
              <p>Amount (in words):</p>
              <p className="font-bold">{amountInWords(total)}</p>
            </td>
            <td colSpan={6} rowSpan={6} className={`${mid} text-center font-bold`}>
              <p>For {company.name}</p>
              {company.signatureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={company.signatureUrl}
                  alt="Signature"
                  className="mx-auto my-1.5 block max-h-14 max-w-[200px] object-contain"
                />
              ) : (
                <div className="h-16" aria-hidden />
              )}
              <p>Authorised Signatory</p>
            </td>
          </tr>
          <tr>
            <td className={`${cell} italic`}>Our bank details:</td>
            <td colSpan={5} className={`${cell} font-bold italic`}>
              <p>Bank: {company.bank.bank}</p>
              <p>A/c No. {company.bank.accountNumber}</p>
              <p>IFSC Code- {company.bank.ifsc}</p>
              <p>{company.bank.branch}</p>
            </td>
          </tr>
          <TermsRow label="Payment Terms" separator=" - " value={q.payment_terms} />
          <TermsRow label="Extended Warranty" separator=": " value={q.extended_warranty} />
          <TermsRow label="Delivery" separator=" - " value={q.delivery_terms} bold />
          <TermsRow label={`${DOCUMENT_TITLE} Validity`} separator=" " value={q.validity} />
        </tbody>
      </table>
    </article>
  );
}

function TermsRow({
  label,
  separator,
  value,
  bold,
}: {
  label: string;
  separator: string;
  value: string | null;
  bold?: boolean;
}) {
  return (
    <tr>
      <td colSpan={6} className={`${cell} whitespace-pre-line ${bold ? "font-bold" : ""}`}>
        <span className="font-bold">{label}</span>
        {separator}
        {value || "—"}
      </td>
    </tr>
  );
}
