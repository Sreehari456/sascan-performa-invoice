import type { Metadata } from "next";
import Link from "next/link";
import { DOCUMENT_TITLE, pageTitle } from "@/lib/branding";
import { computeDashboard, dashboardFromDate, formatInrCompact, type DashboardStats } from "@/lib/dashboard";
import { formatQuotationDate, formatRupees } from "@/lib/quotation/format";
import { todayInIndia } from "@/lib/quotation/numbering";
import { listQuotationsSince, toHundredths, type DashboardRow } from "@/lib/quotation/queries";
import { STATUSES, STATUS_HINTS, STATUS_LABELS } from "@/lib/quotation/status";
import { createClient } from "@/lib/supabase/server";
import { MonthlyChart } from "./monthly-chart";
import { StatusPill } from "./quotations/status-pill";

export const metadata: Metadata = {
  title: pageTitle("Dashboard"),
};

const RECENT_COUNT = 6;

export default async function DashboardPage() {
  const today = todayInIndia();
  const supabase = await createClient();

  let rows: DashboardRow[] | null = null;
  try {
    rows = await listQuotationsSince(supabase, dashboardFromDate(today));
  } catch (error) {
    console.error("Failed to load dashboard:", error);
  }

  if (!rows) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        The dashboard couldn&apos;t be loaded. If you&apos;ve just updated the app, apply the latest database migration,
        then refresh.
      </div>
    );
  }

  const stats = computeDashboard(rows, today);
  const recent = rows.slice(0, RECENT_COUNT);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-[-0.025em] text-ink">Dashboard</h1>
          <p className="text-sm text-muted">Financial year {stats.financialYear} · all amounts include GST</p>
        </div>
        <Link
          href="/dashboard/quotations/new"
          className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-ink"
        >
          New {DOCUMENT_TITLE.toLowerCase()}
        </Link>
      </div>

      <Headline stats={stats} />

      <section aria-labelledby="pipeline-title" className="rounded-[10px] border border-line bg-white p-5">
        <h2 id="pipeline-title" className="mb-3 text-[15px] font-bold">
          By status <span className="text-xs font-medium text-muted">· this financial year</span>
        </h2>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {STATUSES.map((s) => (
            <li key={s}>
              <Link
                href={`/dashboard/quotations?status=${s}`}
                title={STATUS_HINTS[s]}
                className="block rounded-lg border border-line px-4 py-3 hover:border-ink"
              >
                <StatusPill status={s} />
                <span className="mt-2 block text-xl font-semibold text-ink">{formatInrCompact(stats.byStatus[s].value)}</span>
                <span className="block text-xs text-muted">
                  {stats.byStatus[s].count} {STATUS_LABELS[s].toLowerCase()} proforma invoice
                  {stats.byStatus[s].count === 1 ? "" : "s"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <MonthlyChart months={stats.months} financialYear={stats.financialYear} />

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-labelledby="customers-title" className="rounded-[10px] border border-line bg-white p-5">
          <h2 id="customers-title" className="mb-3 text-[15px] font-bold">
            Top customers <span className="text-xs font-medium text-muted">· this financial year, by value</span>
          </h2>
          {stats.topCustomers.length === 0 ? (
            <p className="text-sm text-muted">No proforma invoices yet this financial year.</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="pb-1.5 font-semibold">Customer</th>
                  <th scope="col" className="pb-1.5 text-right font-semibold">Quoted</th>
                  <th scope="col" className="pb-1.5 text-right font-semibold">Accepted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {stats.topCustomers.map((c) => (
                  <tr key={c.key}>
                    <td className="max-w-0 truncate py-2 pr-3" title={c.name}>
                      <span className="text-ink">{c.name}</span>
                      <span className="block text-xs text-muted">
                        {c.count} proforma invoice{c.count === 1 ? "" : "s"}
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums text-ink">{formatInrCompact(c.value)}</td>
                    <td className="py-2 text-right tabular-nums text-muted">
                      {c.acceptedValue > 0 ? formatInrCompact(c.acceptedValue) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section aria-labelledby="recent-title" className="rounded-[10px] border border-line bg-white p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="recent-title" className="text-[15px] font-bold">
              Latest
            </h2>
            <Link href="/dashboard/quotations" className="text-[13px] font-semibold text-brand hover:text-brand-ink">
              View all →
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-muted">Nothing saved yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/dashboard/quotations/${row.id}`}
                    className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-soft"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">{row.invoice_number}</span>
                      <span className="block truncate text-xs text-muted">
                        {row.customer_name} · {formatQuotationDate(row.invoice_date)}
                      </span>
                    </span>
                    <span className="text-right text-[13px] tabular-nums text-ink">
                      ₹{formatRupees(toHundredths(row.total_amount))}
                    </span>
                    <StatusPill status={row.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** The one hero figure (the year's quoted value) and the supporting tiles. */
function Headline({ stats }: { stats: DashboardStats }) {
  const { thisMonth, lastMonth, fy, byStatus, winRate } = stats;
  const change = lastMonth.value > 0 ? (thisMonth.value - lastMonth.value) / lastMonth.value : null;

  return (
    <section aria-label="Summary" className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
      <div className="rounded-[10px] border border-line bg-white p-5">
        <p className="text-[13px] font-semibold text-muted">Quoted this financial year</p>
        <p className="mt-1 text-[48px] font-semibold leading-none tracking-[-0.03em] text-ink">{formatInrCompact(fy.value)}</p>
        <p className="mt-2 text-xs text-muted">
          {fy.count} proforma invoice{fy.count === 1 ? "" : "s"} since 1 April
        </p>
      </div>

      <Tile label={`This month (${thisMonth.label})`} value={formatInrCompact(thisMonth.value)}>
        {thisMonth.count} proforma invoice{thisMonth.count === 1 ? "" : "s"}
        {change !== null && (
          <span className={`mt-0.5 block font-semibold ${change >= 0 ? "text-brand-ink" : "text-red-700"}`}>
            {change >= 0 ? "▲" : "▼"} {Math.abs(Math.round(change * 100))}% vs {lastMonth.label}
          </span>
        )}
      </Tile>

      <Tile label="Waiting for a reply" value={formatInrCompact(byStatus.sent.value)}>
        {byStatus.sent.count} sent, not yet accepted or declined
      </Tile>

      <Tile label="Win rate" value={winRate === null ? "—" : `${Math.round(winRate * 100)}%`}>
        {winRate === null
          ? "Mark proforma invoices accepted or declined to see this"
          : `${byStatus.accepted.count} accepted of ${byStatus.accepted.count + byStatus.declined.count} decided`}
      </Tile>
    </section>
  );
}

function Tile({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-line bg-white p-5">
      <p className="text-[13px] font-semibold text-muted">{label}</p>
      <p className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ink">{value}</p>
      <p className="mt-1 text-xs text-muted">{children}</p>
    </div>
  );
}
