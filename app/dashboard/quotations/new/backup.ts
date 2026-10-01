// The JSON backup format of the standalone quotation page (quotation.html), so
// backups exported there can be imported here and vice versa.

import type { CompanyDetails } from "@/lib/company";
import { financialYearFor } from "@/lib/quotation/numbering";
import type { QuotationRow } from "@/lib/quotation/queries";
import type { QuotationInput } from "@/lib/quotation/validate";

export type BackupCompany = {
  coName?: string;
  coAddr?: string;
  coMob?: string;
  coEmail?: string;
  coGstin?: string;
  coState?: string;
  bkName?: string;
  bkAcc?: string;
  bkIfsc?: string;
  bkBranch?: string;
  /** Data URLs in files from the standalone page. Not imported. */
  logo?: string;
  sig?: string;
};

export type BackupItem = {
  name?: string;
  short?: string;
  details?: string;
  hsn?: string;
  qty?: number | string;
  rate?: number | string;
  gst?: number | string;
};

export type BackupEntry = {
  qPrefix?: string;
  qFy?: string;
  qNo?: number | string;
  qDate?: string;
  cName?: string;
  cAddr?: string;
  cGstin?: string;
  cState?: string;
  tPay?: string;
  tWarranty?: string;
  tDelivery?: string;
  tValidity?: string;
  items?: BackupItem[];
  total?: number;
  number?: string;
  savedAt?: string;
};

export type BackupFile = {
  company: BackupCompany | null;
  history: BackupEntry[];
  exported?: string;
};

export function companyToBackup(company: CompanyDetails): BackupCompany {
  return {
    coName: company.name,
    coAddr: company.addressLines.join("\n"),
    coMob: company.mobile,
    coEmail: company.email,
    coGstin: company.gstin,
    coState: company.stateCode,
    bkName: company.bank.bank,
    bkAcc: company.bank.accountNumber,
    bkIfsc: company.bank.ifsc,
    bkBranch: company.bank.branch,
  };
}

export function quotationToBackup(q: QuotationRow): BackupEntry {
  return {
    qPrefix: q.number_prefix,
    qFy: q.financial_year ?? financialYearFor(q.invoice_date),
    qNo: q.sequence_no ?? 0,
    qDate: q.invoice_date,
    cName: q.customer_name,
    cAddr: q.customer_address,
    cGstin: q.customer_gst ?? "URP",
    cState: q.customer_state_code ?? "",
    tPay: q.payment_terms ?? "",
    tWarranty: q.extended_warranty ?? "",
    tDelivery: q.delivery_terms ?? "",
    tValidity: q.validity ?? "",
    items: q.invoice_items.map((item) => ({
      name: item.item_name ?? "",
      short: item.short_description ?? "",
      details: item.description,
      hsn: item.hsn_code ?? "",
      qty: Number(item.quantity),
      rate: Number(item.rate),
      gst: Number(item.gst_rate ?? 0),
    })),
    total: Number(q.total_amount),
    number: q.invoice_number,
  };
}

/** Numbers in backups are plain JS numbers; the form wants decimal strings with at most 2 places. */
function decimal(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.round(value * 100) / 100);
  return "";
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function backupEntryToInput(entry: BackupEntry): QuotationInput {
  const date = str(entry?.qDate);
  return {
    numberPrefix: str(entry?.qPrefix),
    financialYear: str(entry?.qFy) || (/^\d{4}-\d{2}-\d{2}$/.test(date) ? financialYearFor(date) : ""),
    sequenceNo: decimal(entry?.qNo),
    quotationDate: date,
    customerName: str(entry?.cName),
    customerAddress: str(entry?.cAddr),
    customerGstin: str(entry?.cGstin),
    customerStateCode: str(entry?.cState),
    items: (Array.isArray(entry?.items) ? entry.items : []).map((item) => ({
      itemName: str(item?.name),
      shortDescription: str(item?.short),
      description: str(item?.details),
      hsnCode: str(item?.hsn),
      quantity: decimal(item?.qty),
      rate: decimal(item?.rate),
      gstRate: decimal(item?.gst),
    })),
    paymentTerms: str(entry?.tPay),
    extendedWarranty: str(entry?.tWarranty),
    deliveryTerms: str(entry?.tDelivery),
    validity: str(entry?.tValidity),
  };
}
