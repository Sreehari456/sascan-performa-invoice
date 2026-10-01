import type { Metadata } from "next";
import Link from "next/link";
import { pageTitle } from "@/lib/branding";
import { listProducts, type ProductRow } from "@/lib/products";
import { createClient } from "@/lib/supabase/server";
import { ProductList } from "./product-list";

export const metadata: Metadata = {
  title: pageTitle("Products"),
};

export default async function ProductsPage({ searchParams }: PageProps<"/dashboard/products">) {
  const params = await searchParams;
  const search = typeof params.q === "string" ? params.q.trim() : "";

  const supabase = await createClient();
  let products: ProductRow[] | null = null;
  try {
    products = await listProducts(supabase, search);
  } catch (error) {
    console.error("Failed to load products:", error);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-[-0.025em] text-ink">Products</h1>
        <p className="text-sm text-muted">
          {products &&
            `${products.length.toLocaleString("en-IN")} ${products.length === 1 ? "product" : "products"}${search ? ` matching “${search}”` : ""}. `}
          Pick these when adding an item to a performa invoice.
        </p>
      </div>

      <form action="/dashboard/products" className="flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">
          Search products
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={search}
          placeholder="Search by name, description or HSN"
          className="block w-full max-w-md rounded-lg border border-line bg-white px-3 py-2 text-base text-ink placeholder:text-muted/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-soft sm:text-sm"
        />
        <button type="submit" className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-soft">
          Search
        </button>
        {search && (
          <Link href="/dashboard/products" className="self-center px-2 text-sm font-medium text-muted hover:text-ink">
            Clear
          </Link>
        )}
      </form>

      {!products ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Products couldn&apos;t be loaded. If you&apos;ve just updated the app, apply the latest database migration,
          then refresh.
        </div>
      ) : (
        <ProductList products={products} searching={Boolean(search)} />
      )}
    </div>
  );
}
