// Figures for the dashboard, computed from a financial year's quotations.
// Money is summed in paise (BigInt) and only turned into rupees at the end.

import { financialYearFor } from "@/lib/quotation/numbering";
import { toHundredths, type DashboardRow } from "@/lib/quotation/queries";
import { STATUSES, statusOf, type Status } from "@/lib/quotation/status";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ZERO = BigInt(0);

export type Tally = { count: number; value: number };

export type MonthPoint = {
  /** "2026-09" */
  key: string;
  /** "Sep" */
  label: string;
  /** "Sep 2026" */
  longLabel: string;
  count: number;
  /** Rupees. */
  value: number;
  /** After this month: nothing can be there yet. */
  future: boolean;
};

export type CustomerTotal = { key: string; customerId: string | null; name: string; count: number; value: number; acceptedValue: number };

export type DashboardStats = {
  financialYear: string;
  /** First day of the financial year, YYYY-MM-DD. */
  fyStart: string;
  thisMonth: Tally & { label: string };
  lastMonth: Tally & { label: string };
  fy: Tally;
  byStatus: Record<Status, Tally>;
  /** Accepted ÷ (accepted + declined), by count; null until something is decided. */
  winRate: number | null;
  months: MonthPoint[];
  topCustomers: CustomerTotal[];
};

/** First day of the month `offset` months from the one `isoDate` is in. */
function monthStart(isoDate: string, offset = 0): string {
  const [y, m] = isoDate.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** The earliest date the dashboard needs: the FY start or last month, whichever is earlier. */
export function dashboardFromDate(today: string): string {
  const fyStart = `${financialYearFor(today).slice(0, 4)}-04-01`;
  const lastMonth = monthStart(today, -1);
  return lastMonth < fyStart ? lastMonth : fyStart;
}

const rupees = (paise: bigint) => Number(paise) / 100;

export function computeDashboard(rows: DashboardRow[], today: string): DashboardStats {
  const financialYear = financialYearFor(today);
  const fyYear = Number(financialYear.slice(0, 4));
  const fyStart = `${fyYear}-04-01`;
  const thisMonthKey = today.slice(0, 7);
  const lastMonthKey = monthStart(today, -1).slice(0, 7);

  const sums = new Map<string, { count: number; paise: bigint }>(); // by month
  const status = Object.fromEntries(STATUSES.map((s) => [s, { count: 0, paise: ZERO }])) as Record<
    Status,
    { count: number; paise: bigint }
  >;
  const customers = new Map<string, { customerId: string | null; name: string; count: number; paise: bigint; accepted: bigint }>();
  let fyCount = 0;
  let fyPaise = ZERO;

  for (const row of rows) {
    const paise = toHundredths(row.total_amount);
    const month = row.invoice_date.slice(0, 7);
    const m = sums.get(month) ?? { count: 0, paise: ZERO };
    sums.set(month, { count: m.count + 1, paise: m.paise + paise });

    if (row.invoice_date < fyStart) continue; // only needed for "last month"
    fyCount++;
    fyPaise += paise;
    const s = statusOf(row.status);
    status[s] = { count: status[s].count + 1, paise: status[s].paise + paise };

    const key = row.customer_id ?? `name:${row.customer_name.trim().toLowerCase()}`;
    const c = customers.get(key) ?? { customerId: row.customer_id, name: row.customer_name, count: 0, paise: ZERO, accepted: ZERO };
    customers.set(key, {
      ...c,
      count: c.count + 1,
      paise: c.paise + paise,
      accepted: c.accepted + (s === "accepted" ? paise : ZERO),
    });
  }

  const tally = (key: string): Tally => {
    const m = sums.get(key);
    return { count: m?.count ?? 0, value: rupees(m?.paise ?? ZERO) };
  };
  const monthLabel = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1];

  const months: MonthPoint[] = Array.from({ length: 12 }, (_, i) => {
    const key = monthStart(`${fyYear}-04-01`, i).slice(0, 7);
    return {
      key,
      label: monthLabel(key),
      longLabel: `${monthLabel(key)} ${key.slice(0, 4)}`,
      ...tally(key),
      future: key > thisMonthKey,
    };
  });

  const decided = status.accepted.count + status.declined.count;

  return {
    financialYear,
    fyStart,
    thisMonth: { ...tally(thisMonthKey), label: monthLabel(thisMonthKey) },
    lastMonth: { ...tally(lastMonthKey), label: monthLabel(lastMonthKey) },
    fy: { count: fyCount, value: rupees(fyPaise) },
    byStatus: Object.fromEntries(
      STATUSES.map((s) => [s, { count: status[s].count, value: rupees(status[s].paise) }]),
    ) as Record<Status, Tally>,
    winRate: decided > 0 ? status.accepted.count / decided : null,
    months,
    topCustomers: [...customers.entries()]
      .map(([key, c]) => ({
        key,
        customerId: c.customerId,
        name: c.name,
        count: c.count,
        value: rupees(c.paise),
        acceptedValue: rupees(c.accepted),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5),
  };
}

/** ₹45,000 · ₹7.3 L · ₹1.2 Cr — Indian units, for figures and axis ticks. */
export function formatInrCompact(rupeeValue: number): string {
  const v = Math.abs(rupeeValue);
  const sign = rupeeValue < 0 ? "-" : "";
  const trim = (n: number, digits: number) => String(Number(n.toFixed(digits)));
  if (v >= 1e7) return `${sign}₹${trim(v / 1e7, v >= 1e9 ? 0 : 2)} Cr`;
  if (v >= 1e5) return `${sign}₹${trim(v / 1e5, 1)} L`;
  return `${sign}₹${Math.round(v).toLocaleString("en-IN")}`;
}

/** Clean axis ticks from 0 to just above `max`, about `target` steps. */
export function niceTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / magnitude;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * magnitude;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}
