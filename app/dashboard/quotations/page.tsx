import type { Metadata } from "next";
import Link from "next/link";
import { pageTitle } from "@/lib/branding";
import { createClient } from "@/lib/supabase/server";
import { formatQuotationDate, formatRupees } from "@/lib/quotation/format";
import { QUOTATIONS_PAGE_SIZE, listQuotations, toHundredths } from "@/lib/quotation/queries";
import { STATUSES, STATUS_LABELS, isStatus } from "@/lib/quotation/status";
import { StatusPill } from "./status-pill";

export const metadata: Metadata = {
  title: pageTitle("Saved performa invoices"),
};

export default async function QuotationsPage({ searchParams }: PageProps<"/dashboard/quotations">) {
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q.trim() : "";
  const page = Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);
  const deleted = typeof params.deleted === "string" ? params.deleted : null;
  const status = isStatus(params.status) ? params.status : null;

  const supabase = await createClient();
  let result: Awaited<ReturnType<typeof listQuotations>> | null = null;
  try {
    result = await listQuotations(supabase, { search, page, status });
  } catch (error) {
    console.error("Failed to load quotations:", error);
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / QUOTATIONS_PAGE_SIZE)) : 1;
  const pageHref = (target: number, statusFilter: string | null = status) => {
    const query = new URLSearchParams();
    if (search) query.set("q", search);
    if (statusFilter) query.set("status", statusFilter);
    if (target > 1) query.set("page", String(target));
    const qs = query.toString();
    return `/dashboard/quotations${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-6">
      {deleted && (
        <div role="status" className="rounded-lg border border-[#c7dec5] bg-brand-soft px-4 py-3 text-sm text-brand-ink">
          Performa invoice <span className="font-semibold">{deleted}</span> was deleted.
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-[-0.025em] text-ink">Saved performa invoices</h1>
          <p className="text-sm text-muted">
            {result ? `${result.total.toLocaleString("en-IN")} ${result.total === 1 ? "performa invoice" : "performa invoices"}` : " "}
            {status && result ? ` · ${STATUS_LABELS[status].toLowerCase()}` : ""}
            {search && result ? ` matching “${search}”` : ""}
          </p>
        </div>
        <Link
          href="/dashboard/quotations/new"
          className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          New performa invoice
        </Link>
      </div>

      <form action="/dashboard/quotations" className="flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          Search performa invoices
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={search}
          placeholder="Search by number or customer"
          className="block w-full max-w-md rounded-lg border border-line bg-white px-3 py-2 text-base text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-soft sm:text-sm"
        />
        <button
          type="submit"
          className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-soft"
        >
          Search
        </button>
        {status && <input type="hidden" name="status" value={status} />}
        {search && (
          <Link href="/dashboard/quotations" className="self-center px-2 text-sm font-medium text-muted hover:text-ink">
            Clear
          </Link>
        )}
      </form>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
        {[null, ...STATUSES].map((s) => {
          const active = s === status;
          return (
            <Link
              key={s ?? "all"}
              href={pageHref(1, s)}
              aria-current={active ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold ${
                active ? "border-ink bg-ink text-white" : "border-line bg-white text-muted hover:border-ink hover:text-ink"
              }`}
            >
              {s ? STATUS_LABELS[s] : "All"}
            </Link>
          );
        })}
      </nav>

      {!result ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Performa invoices couldn&apos;t be loaded. Please refresh the page to try again.
        </div>
      ) : result.rows.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-line bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-ink">
            {search ? "No performa invoices match your search." : "No performa invoices yet."}
          </p>
          <p className="mt-1 text-sm text-muted">
            {search ? "Try a different number or customer name." : "Create your first performa invoice to see it here."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-line bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-line text-sm">
              <thead className="bg-soft text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">Number</th>
                  <th scope="col" className="px-4 py-3">Date</th>
                  <th scope="col" className="px-4 py-3">Customer</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="hidden px-4 py-3 md:table-cell">State</th>
                  <th scope="col" className="hidden px-4 py-3 text-right lg:table-cell">Taxable</th>
                  <th scope="col" className="hidden px-4 py-3 text-right lg:table-cell">GST</th>
                  <th scope="col" className="px-4 py-3 text-right">Total</th>
                  <th scope="col" className="px-4 py-3 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.rows.map((row) => (
                  <tr key={row.id} className="hover:bg-soft">
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-ink">{row.invoice_number}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{formatQuotationDate(row.invoice_date)}</td>
                    <td className="max-w-[16rem] truncate px-4 py-3 text-ink" title={row.customer_name}>
                      {row.customer_name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusPill status={row.status} />
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-muted md:table-cell">
                      {row.customer_state ?? "—"}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted lg:table-cell">
                      ₹{formatRupees(toHundredths(row.subtotal))}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-right tabular-nums text-muted lg:table-cell">
                      ₹{formatRupees(toHundredths(row.gst_amount))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-ink">
                      ₹{formatRupees(toHundredths(row.total_amount))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/quotations/${row.id}`}
                        className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-brand-ink hover:bg-brand-soft"
                      >
                        View<span className="sr-only"> {row.invoice_number}</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <nav className="flex items-center justify-between border-t border-line px-4 py-3 text-sm" aria-label="Pagination">
              <span className="text-muted">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link href={pageHref(page - 1)} className="rounded-lg border border-line px-3 py-1.5 font-medium text-ink hover:bg-soft">
                    Previous
                  </Link>
                )}
                {page < totalPages && (
                  <Link href={pageHref(page + 1)} className="rounded-lg border border-line px-3 py-1.5 font-medium text-ink hover:bg-soft">
                    Next
                  </Link>
                )}
              </div>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
