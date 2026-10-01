// Layout rules shared by the on-screen quotation preview and the PDF,
// taken from reference/current-invoice.pdf.
import { taxModeFor } from "./calc";
import { formatPercent, formatRupees } from "./format";
import { toHundredths } from "./queries";

/** Item table column widths, as % of the table width (measured from the reference). */
export const COLUMN_WIDTHS = [28.3, 7.4, 3.9, 7.1, 8.0, 7.0, 5.8, 4.5, 6.0, 4.5, 7.3, 10.2];

/** Sum of the widths of columns [from, to) — for cells spanning several columns. */
export function spanWidth(from: number, to: number): number {
  return COLUMN_WIDTHS.slice(from, to).reduce((sum, width) => sum + width, 0);
}

/** Zero amounts print as "-". */
export function amountOrDash(paise: bigint): string {
  return paise === BigInt(0) ? "-" : formatRupees(paise);
}

/** Zero amounts are left blank. */
export function amountOrBlank(paise: bigint): string {
  return paise === BigInt(0) ? "" : formatRupees(paise);
}

/** CGST/SGST/IGST rate labels for a line, e.g. same state 5% -> 2.5% / 2.5% / 0%. */
export function lineTaxRates(
  gstRate: number | string | null,
  customerStateCode: string | null,
  companyStateCode: string,
) {
  const percent = Number(toHundredths(gstRate)) / 100;
  const intra = taxModeFor(customerStateCode ?? "", companyStateCode) === "intra";
  const half = formatPercent(intra ? percent / 2 : 0);
  return { cgst: half, sgst: half, igst: formatPercent(intra ? 0 : percent) };
}

/** e.g. (45, "Rotary Club") -> "Quotation-045 Rotary Club.pdf", as the standalone page named them. */
export function quotationPdfFilename(sequenceNo: number | null, customerName: string): string {
  const base = `Quotation-${String(sequenceNo ?? 0).padStart(3, "0")} ${customerName}`;
  return `${base.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim()}.pdf`;
}
