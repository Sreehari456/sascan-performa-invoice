import { computeLine, parseHundredths, sumLines, taxModeFor, type LineAmounts, type TaxMode, type Totals } from "./calc";
import { formatQuotationNumber } from "./numbering";
import { findState } from "./states";

/** What the form submits. Every field is a raw string, as typed. */
export type QuotationInput = {
  numberPrefix: string;
  financialYear: string;
  /** The "No." part of the quotation number, e.g. "45". */
  sequenceNo: string;
  customerName: string;
  customerAddress: string;
  customerStateCode: string;
  customerGstin: string;
  quotationDate: string;
  items: LineItemInput[];
  paymentTerms: string;
  extendedWarranty: string;
  deliveryTerms: string;
  validity: string;
};

export type LineItemInput = {
  itemName: string;
  shortDescription: string;
  description: string;
  hsnCode: string;
  quantity: string;
  rate: string;
  gstRate: string;
};

export type ValidLineItem = {
  itemName: string;
  shortDescription: string | null;
  description: string;
  hsnCode: string | null;
  quantity: bigint;
  rate: bigint;
  gstRate: bigint;
  amounts: LineAmounts;
};

export type ValidQuotation = {
  numberPrefix: string;
  financialYear: string;
  sequenceNo: number;
  invoiceNumber: string;
  companyStateCode: string;
  customerName: string;
  customerAddress: string;
  customerState: string;
  customerStateCode: string;
  /** null means unregistered (URP). */
  customerGstin: string | null;
  quotationDate: string;
  taxMode: TaxMode;
  items: ValidLineItem[];
  totals: Totals;
  paymentTerms: string;
  extendedWarranty: string;
  deliveryTerms: string;
  validity: string;
};

/** Keys: "customerName", "items.0.rate", etc. */
export type FieldErrors = Record<string, string>;

export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const MAX_QUANTITY = BigInt(999999999); // numeric(10,2) -> 99,99,999.99 in hundredths
const MAX_AMOUNT = BigInt("999999999999"); // numeric(12,2) -> 99,99,99,999.99 in paise
const MAX_GST_RATE = BigInt(10000); // 100%
const ZERO = BigInt(0);

export function normaliseGstin(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

const FINANCIAL_YEAR_PATTERN = /^(\d{4})-(\d{2})$/;
const MAX_SEQUENCE_NO = 99999;

/** "2026-27" is valid; "2026-28" and "26-27" aren't. */
export function isFinancialYear(value: string): boolean {
  const match = value.match(FINANCIAL_YEAR_PATTERN);
  return Boolean(match) && (Number(match![1]) + 1) % 100 === Number(match![2]);
}

/**
 * Checks a quotation. `companyStateCode` decides CGST + SGST vs IGST; on the
 * server it comes from company_settings, never from the browser.
 */
export function validateQuotation(
  input: QuotationInput,
  companyStateCode: string,
): { ok: true; data: ValidQuotation } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

  const numberPrefix = text(input.numberPrefix);
  if (!numberPrefix) errors.numberPrefix = "Enter a prefix.";
  else if (numberPrefix.length > 20) errors.numberPrefix = "Keep the prefix under 20 characters.";

  const financialYear = text(input.financialYear);
  if (!isFinancialYear(financialYear)) errors.financialYear = "Use the form 2026-27.";

  const sequenceText = text(input.sequenceNo);
  const sequenceNo = /^\d{1,5}$/.test(sequenceText) ? Number(sequenceText) : 0;
  if (sequenceNo < 1 || sequenceNo > MAX_SEQUENCE_NO) errors.sequenceNo = "Enter a number from 1 to 99999.";

  const customerName = text(input.customerName);
  if (!customerName) errors.customerName = "Enter the customer name.";

  // Optional, as on the standalone page.
  const customerAddress = text(input.customerAddress);

  const state = findState(text(input.customerStateCode));
  if (!state) errors.customerStateCode = "Select the customer's state.";

  const gstinRaw = normaliseGstin(text(input.customerGstin));
  let customerGstin: string | null = null;
  if (gstinRaw && gstinRaw !== "URP") {
    if (!GSTIN_PATTERN.test(gstinRaw)) {
      errors.customerGstin = "Enter a valid 15-character GSTIN, or leave blank for URP.";
    } else {
      customerGstin = gstinRaw;
    }
  }

  const quotationDate = text(input.quotationDate);
  if (!isValidIsoDate(quotationDate)) errors.quotationDate = "Enter a valid date.";

  const taxMode = taxModeFor(state?.code ?? "", companyStateCode);
  const rawItems = Array.isArray(input.items) ? input.items : [];
  if (rawItems.length === 0) errors.items = "Add at least one line item.";

  const items: ValidLineItem[] = [];
  rawItems.forEach((raw, i) => {
    const key = (field: string) => `items.${i}.${field}`;
    const itemName = text(raw?.itemName);
    if (!itemName) errors[key("itemName")] = "Enter the item name.";

    const hsnCode = text(raw?.hsnCode);
    if (hsnCode && !/^[0-9]{4,8}$/.test(hsnCode)) {
      errors[key("hsnCode")] = "HSN code must be 4–8 digits.";
    }

    const quantity = parseHundredths(text(raw?.quantity));
    if (quantity === null || quantity <= ZERO) {
      errors[key("quantity")] = "Enter a quantity above 0 (up to 2 decimals).";
    } else if (quantity > MAX_QUANTITY) {
      errors[key("quantity")] = "Quantity is too large.";
    }

    const rate = parseHundredths(text(raw?.rate));
    if (rate === null) errors[key("rate")] = "Enter a valid rate (up to 2 decimals).";

    const gstRate = parseHundredths(text(raw?.gstRate));
    if (gstRate === null || gstRate > MAX_GST_RATE) {
      errors[key("gstRate")] = "Enter a GST rate between 0 and 100.";
    }

    if (quantity !== null && rate !== null && gstRate !== null) {
      const amounts = computeLine(quantity, rate, gstRate, taxMode);
      if (amounts.total > MAX_AMOUNT || rate > MAX_AMOUNT) {
        errors[key("rate")] = "This line's amount is too large.";
      }
      items.push({
        itemName,
        shortDescription: text(raw?.shortDescription) || null,
        description: text(raw?.description),
        hsnCode: hsnCode || null,
        quantity,
        rate,
        gstRate,
        amounts,
      });
    }
  });

  const totals = sumLines(items.map((item) => item.amounts));
  if (totals.total > MAX_AMOUNT) errors.items = "The total is too large.";

  if (Object.keys(errors).length > 0 || !state) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      numberPrefix,
      financialYear,
      sequenceNo,
      invoiceNumber: formatQuotationNumber(numberPrefix, financialYear, sequenceNo),
      companyStateCode,
      customerName,
      customerAddress,
      customerState: state.name,
      customerStateCode: state.code,
      customerGstin,
      quotationDate,
      taxMode,
      items,
      totals,
      paymentTerms: text(input.paymentTerms),
      extendedWarranty: text(input.extendedWarranty),
      deliveryTerms: text(input.deliveryTerms),
      validity: text(input.validity),
    },
  };
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}
