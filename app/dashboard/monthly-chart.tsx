"use client";

import { useState } from "react";
import { formatInrCompact, niceTicks, type MonthPoint } from "@/lib/dashboard";

const PLOT_HEIGHT = 200; // px

/**
 * Proforma invoice value per month of the financial year: one series, so no
 * legend (the title names it). Each column is a hover/focus target with a
 * tooltip, the highest month carries a direct label, and the same numbers are
 * in the table underneath.
 */
export function MonthlyChart({ months, financialYear }: { months: MonthPoint[]; financialYear: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(0, ...months.map((m) => m.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const peak = max > 0 ? months.findIndex((m) => m.value === max) : -1;

  return (
    <figure className="rounded-[10px] border border-line bg-white p-5">
      <figcaption className="mb-4">
        <span className="block text-[15px] font-bold text-ink">Value by month</span>
        <span className="block text-xs text-muted">FY {financialYear} · proforma invoice totals including GST</span>
      </figcaption>

      <div className="flex gap-2">
        {/* Y axis */}
        <div className="relative w-14 shrink-0" style={{ height: PLOT_HEIGHT }} aria-hidden>
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-0 -translate-y-1/2 text-[11px] tabular-nums text-muted"
              style={{ top: PLOT_HEIGHT - (t / top) * PLOT_HEIGHT }}
            >
              {t === 0 ? "0" : formatInrCompact(t)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          {/* Plot */}
          <div className="relative" style={{ height: PLOT_HEIGHT }} onPointerLeave={() => setActive(null)}>
            {ticks.map((t) => (
              <div
                key={t}
                aria-hidden
                className="absolute inset-x-0 h-px bg-[#eceee9]"
                style={{ top: PLOT_HEIGHT - (t / top) * PLOT_HEIGHT }}
              />
            ))}
            <div className="absolute inset-0 grid grid-cols-12">
              {months.map((m, i) => {
                const height = (m.value / top) * PLOT_HEIGHT;
                const summary = m.future
                  ? `${m.longLabel}: not yet`
                  : `${m.longLabel}: ${formatInrCompact(m.value)}, ${m.count} proforma invoice${m.count === 1 ? "" : "s"}`;
                return (
                  // The whole column slot is the hit target, not just the bar.
                  <button
                    key={m.key}
                    type="button"
                    aria-label={summary}
                    onPointerEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    className="group relative flex h-full items-end justify-center outline-none focus-visible:bg-brand-soft/50"
                  >
                    {i === peak && active !== i && (
                      <span
                        aria-hidden
                        className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-ink"
                        style={{ bottom: height + 4 }}
                      >
                        {formatInrCompact(m.value)}
                      </span>
                    )}
                    {height > 0 && (
                      <span
                        aria-hidden
                        className={`block w-[60%] max-w-6 rounded-t-[4px] bg-brand transition-opacity ${
                          active !== null && active !== i ? "opacity-60" : ""
                        }`}
                        style={{ height: Math.max(height, 2) }}
                      />
                    )}
                    {active === i && <Tooltip month={m} bottom={height + 8} alignRight={i >= 9} alignLeft={i <= 1} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* X axis */}
          <div className="mt-1.5 grid grid-cols-12 border-t border-[#dfe2dc] pt-1.5" aria-hidden>
            {months.map((m) => (
              <span key={m.key} className={`text-center text-[11px] ${m.future ? "text-muted/50" : "text-muted"}`}>
                {m.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-[13px] font-semibold text-brand hover:text-brand-ink">Show as table</summary>
        <table className="mt-2 w-full text-[13px]">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th scope="col" className="py-1 font-semibold">Month</th>
              <th scope="col" className="py-1 text-right font-semibold">Proforma invoices</th>
              <th scope="col" className="py-1 text-right font-semibold">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {months.map((m) => (
              <tr key={m.key}>
                <td className="py-1">{m.longLabel}</td>
                <td className="py-1 text-right tabular-nums">{m.future ? "—" : m.count}</td>
                <td className="py-1 text-right tabular-nums">
                  {m.future ? "—" : `₹${m.value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function Tooltip({
  month,
  bottom,
  alignLeft,
  alignRight,
}: {
  month: MonthPoint;
  bottom: number;
  alignLeft: boolean;
  alignRight: boolean;
}) {
  const position = alignRight ? "right-0" : alignLeft ? "left-0" : "left-1/2 -translate-x-1/2";
  return (
    <span
      role="presentation"
      className={`pointer-events-none absolute z-10 whitespace-nowrap rounded-lg border border-line bg-white px-3 py-2 text-left shadow-[0_6px_20px_rgba(0,0,0,0.12)] ${position}`}
      style={{ bottom: Math.min(bottom, PLOT_HEIGHT - 8) }}
    >
      <span className="block text-[14px] font-semibold text-ink">
        {month.future ? "—" : formatInrCompact(month.value)}
      </span>
      <span className="block text-xs text-muted">
        {month.longLabel}
        {!month.future && ` · ${month.count} proforma invoice${month.count === 1 ? "" : "s"}`}
      </span>
    </span>
  );
}
