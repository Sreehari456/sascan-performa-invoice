// GST calculations for quotations.
//
// All arithmetic uses BigInt in fixed-point units so totals never drift:
//   money     -> paise (1/100 rupee)
//   quantity  -> hundredths (numeric(10,2))
//   GST rate  -> hundredths of a percent (5% = 500)
// Rounding is half-up to the nearest paisa, per line.

/** Sascan Meditech's GST state code (Kerala); the company's state is editable. */
export const DEFAULT_COMPANY_STATE_CODE = "32";

export type TaxMode = "intra" | "inter";

export type LineAmounts = {
  taxable: bigint;
  cgst: bigint;
  sgst: bigint;
  igst: bigint;
  total: bigint;
};

export type Totals = LineAmounts;

const ZERO = BigInt(0);
const TWO = BigInt(2);
const HUNDRED = BigInt(100);
const TEN_THOUSAND = BigInt(10000);
const TWENTY_THOUSAND = BigInt(20000);

/** Customers in the company's own state pay CGST + SGST; everyone else pays IGST. */
export function taxModeFor(customerStateCode: string, companyStateCode: string): TaxMode {
  return customerStateCode === companyStateCode ? "intra" : "inter";
}

/**
 * Parses a non-negative decimal string (commas allowed) into hundredths.
 * Returns null if it isn't a valid number with at most two decimals.
 */
export function parseHundredths(value: string): bigint | null {
  const s = value.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, fraction = ""] = s.split(".");
  return BigInt(whole) * HUNDRED + BigInt(fraction.padEnd(2, "0"));
}

function roundDiv(numerator: bigint, divisor: bigint): bigint {
  return (numerator * TWO + divisor) / (TWO * divisor);
}

export function computeLine(
  quantity: bigint,
  ratePaise: bigint,
  gstRate: bigint,
  mode: TaxMode,
): LineAmounts {
  const taxable = roundDiv(quantity * ratePaise, HUNDRED);
  let cgst = ZERO;
  let sgst = ZERO;
  let igst = ZERO;

  if (mode === "intra") {
    // Half the rate each for CGST and SGST.
    cgst = roundDiv(taxable * gstRate, TWENTY_THOUSAND);
    sgst = cgst;
  } else {
    igst = roundDiv(taxable * gstRate, TEN_THOUSAND);
  }

  return { taxable, cgst, sgst, igst, total: taxable + cgst + sgst + igst };
}

export function sumLines(lines: LineAmounts[]): Totals {
  return lines.reduce<Totals>(
    (acc, line) => ({
      taxable: acc.taxable + line.taxable,
      cgst: acc.cgst + line.cgst,
      sgst: acc.sgst + line.sgst,
      igst: acc.igst + line.igst,
      total: acc.total + line.total,
    }),
    { taxable: ZERO, cgst: ZERO, sgst: ZERO, igst: ZERO, total: ZERO },
  );
}

/** Converts hundredths (paise, quantity, rate) to a "1234.50" string for Postgres numeric. */
export function hundredthsToDecimal(value: bigint): string {
  const whole = value / HUNDRED;
  const fraction = (value % HUNDRED).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}
