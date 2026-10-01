const HUNDRED = BigInt(100);

const inr = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats paise with Indian digit grouping, e.g. 76650000n -> "7,66,500.00". */
export function formatPaise(paise: bigint): string {
  return inr.format(Number(paise) / 100);
}

const inrWhole = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Like formatPaise, but drops ".00" for whole rupees, as on the printed quotation. */
export function formatRupees(paise: bigint): string {
  return paise % HUNDRED === BigInt(0) ? inrWhole.format(Number(paise / HUNDRED)) : formatPaise(paise);
}

const quantityFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/** Quantity in hundredths, e.g. 150n -> "1.5". */
export function formatQuantity(hundredths: bigint): string {
  return quantityFormat.format(Number(hundredths) / 100);
}

/** e.g. 5 -> "5%", 2.5 -> "2.5%". */
export function formatPercent(percent: number): string {
  return `${Number(percent.toFixed(3))}%`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-01" -> "01-Oct-2026", the format used on the reference quotation. */
export function formatQuotationDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  const monthName = MONTHS[Number(month) - 1];
  return monthName ? `${day}-${monthName}-${year}` : isoDate;
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  return [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(" ");
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds ? `${ONES[hundreds]} Hundred` : "", rest ? belowHundred(rest) : ""]
    .filter(Boolean)
    .join(" ");
}

/** Indian numbering system words: crore, lakh, thousand, hundred. */
function indianWords(n: number): string {
  if (n === 0) return "";
  const parts: string[] = [];

  const crore = Math.floor(n / 10_000_000);
  if (crore) parts.push(`${indianWords(crore)} Crore`);
  n %= 10_000_000;

  const lakh = Math.floor(n / 100_000);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  n %= 100_000;

  const thousand = Math.floor(n / 1000);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  n %= 1000;

  if (n) parts.push(belowThousand(n));
  return parts.join(" ");
}

/** e.g. 76650000n -> "Rupees Seven Lakh Sixty Six Thousand Five Hundred Only". */
export function amountInWords(paise: bigint): string {
  const rupees = Number(paise / HUNDRED);
  const remainder = Number(paise % HUNDRED);
  let words = `Rupees ${indianWords(rupees) || "Zero"}`;
  if (remainder) words += ` and ${belowHundred(remainder)} Paise`;
  return `${words} Only`;
}
