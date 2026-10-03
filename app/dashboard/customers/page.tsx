import type { Metadata } from "next";
import Link from "next/link";
import { pageTitle } from "@/lib/branding";
import { listCustomersWithCounts, type CustomerListRow } from "@/lib/customers";
import { createClient } from "@/lib/supabase/server";
import { CustomerList } from "./customer-list";

export const metadata: Metadata = {
  title: pageTitle("Customers"),
};

export default async function CustomersPage({ searchParams }: PageProps<"/dashboard/customers">) {
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q.trim() : "";

  const supabase = await createClient();
  let customers: CustomerListRow[] | null = null;
  try {
    customers = await listCustomersWithCounts(supabase, search);
  } catch (error) {
    console.error("Failed to load customers:", error);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-[-0.025em] text-ink">Customers</h1>
        <p className="text-sm text-muted">
          {customers &&
            `${customers.length.toLocaleString("en-IN")} ${customers.length === 1 ? "customer" : "customers"}${search ? ` matching “${search}”` : ""}. `}
          Saved automatically when you save a proforma invoice.
        </p>
      </div>

      <form action="/dashboard/customers" className="flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          Search customers
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={search}
          placeholder="Search by name or GSTIN"
          className="block w-full max-w-md rounded-lg border border-line bg-white px-3 py-2 text-base text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-soft sm:text-sm"
        />
        <button type="submit" className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-soft">
          Search
        </button>
        {search && (
          <Link href="/dashboard/customers" className="self-center px-2 text-sm font-medium text-muted hover:text-ink">
            Clear
          </Link>
        )}
      </form>

      {!customers ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Customers couldn&apos;t be loaded. If you&apos;ve just updated the app, apply the latest database migration,
          then refresh.
        </div>
      ) : customers.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-line bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-ink">
            {search ? "No customers match your search." : "No customers yet."}
          </p>
          <p className="mt-1 text-sm text-muted">
            {search ? "Try a different name or GSTIN." : "They're added when you save a proforma invoice."}
          </p>
        </div>
      ) : (
        <CustomerList customers={customers} />
      )}
    </div>
  );
}
