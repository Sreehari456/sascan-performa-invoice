/** Today's date in India as YYYY-MM-DD, regardless of the server's time zone. */
export function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Indian financial year (April–March) for a YYYY-MM-DD date, e.g. "2026-27". */
export function financialYearFor(isoDate: string): string {
  const [year, month] = isoDate.split("-").map(Number);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export const DEFAULT_NUMBER_PREFIX = "SAS/QT/";

/** e.g. ("SAS/QT/", "2026-27", 45) -> "SAS/QT/2026-27/045". */
export function formatQuotationNumber(prefix: string, financialYear: string, sequenceNo: number): string {
  return `${prefix}${financialYear}/${String(sequenceNo).padStart(3, "0")}`;
}
