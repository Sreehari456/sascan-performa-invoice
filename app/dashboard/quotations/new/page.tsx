import type { Metadata } from "next";
import { pageTitle } from "@/lib/branding";
import { getCompanyDetails } from "@/lib/company";
import { listCustomers, type CustomerRow } from "@/lib/customers";
import { listProducts, type ProductRow } from "@/lib/products";
import { createClient } from "@/lib/supabase/server";
import { financialYearFor, todayInIndia } from "@/lib/quotation/numbering";
import { getQuotation, listQuotations, type QuotationListRow } from "@/lib/quotation/queries";
import { fetchNextSequenceNo } from "@/lib/quotation/sequence";
import { QuotationForm } from "./quotation-form";

export const metadata: Metadata = {
  title: pageTitle("New performa invoice"),
};

const RECENT_COUNT = 10;

/**
 * The performa invoice generator. `?edit=<id>` opens a saved one in the form;
 * `?customer=<id>` starts a new one for a saved customer.
 */
export default async function NewQuotationPage({ searchParams }: PageProps<"/dashboard/quotations/new">) {
  const params = await searchParams;
  const editId = typeof params.edit === "string" ? params.edit : null;
  const customerId = typeof params.customer === "string" ? params.customer : null;
  const today = todayInIndia();
  const financialYear = financialYearFor(today);

  // Sign-in is enforced by the dashboard layout and the proxy.
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub ?? "";
  const [nextNo, recent, company, { data: profile }, opened, customers, products] = await Promise.all([
    fetchNextSequenceNo(supabase, financialYear).catch(() => null), // confirmed on save
    listQuotations(supabase, { search: "", page: 1 })
      .then(({ rows, total }) => ({ rows: rows.slice(0, RECENT_COUNT), total }))
      .catch(() => ({ rows: [] as QuotationListRow[], total: 0 })),
    getCompanyDetails(supabase),
    supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
    editId ? getQuotation(supabase, editId).catch(() => null) : Promise.resolve(null),
    listCustomers(supabase).catch((error): CustomerRow[] => {
      console.error("Failed to load customers:", error);
      return [];
    }),
    listProducts(supabase).catch((error): ProductRow[] => {
      console.error("Failed to load products:", error);
      return [];
    }),
  ]);
  const presetCustomer = (!opened && customerId && customers.find((c) => c.id === customerId)) || null;

  return (
    <QuotationForm
      today={today}
      initialSequenceNo={nextNo}
      recent={recent.rows}
      savedCount={recent.total}
      company={company}
      canEditCompany={profile?.role === "admin"}
      userId={userId}
      opened={opened}
      customers={customers}
      presetCustomer={presetCustomer}
      products={products}
    />
  );
}
