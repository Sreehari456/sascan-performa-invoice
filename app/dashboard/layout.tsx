import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/auth/actions";
import { DOCUMENT_TITLE } from "@/lib/branding";
import { getCompanyDetails } from "@/lib/company";

export default async function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  // The proxy already redirects signed-out users; this is the server-side check.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) {
    redirect("/login");
  }

  const email = typeof claims.email === "string" ? claims.email : "";
  const [company, { data: profile }] = await Promise.all([
    getCompanyDetails(supabase, { signUrls: false }),
    supabase.from("profiles").select("role").eq("id", claims.sub).maybeSingle(),
  ]);
  const isAdmin = profile?.role === "admin";

  return (
    <div className="flex min-h-full flex-1 flex-col bg-canvas text-ink">
      <header className="mx-auto flex w-full max-w-[1360px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-[18px] pt-5 pb-4">
        <Link href="/dashboard" className="flex items-center gap-[11px]">
          <span className="flex size-8 items-center justify-center rounded-[9px] bg-brand text-[15px] font-bold text-white">
            S
          </span>
          <span>
            <span className="block text-[19px] font-bold leading-tight tracking-[-0.025em]">{DOCUMENT_TITLE}</span>
            <span className="mt-px block text-xs text-muted">{company.name}</span>
          </span>
        </Link>

        <nav aria-label="Main" className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
          <NavLink href="/dashboard">Dashboard</NavLink>
          <NavLink href="/dashboard/quotations/new">New performa invoice</NavLink>
          <NavLink href="/dashboard/quotations">Saved performa invoices</NavLink>
          <NavLink href="/dashboard/customers">Customers</NavLink>
          <NavLink href="/dashboard/products">Products</NavLink>
          {isAdmin && <NavLink href="/dashboard/users">Users</NavLink>}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/account"
            title="My account"
            className="max-w-[16rem] truncate rounded-full border border-[#c7dec5] bg-brand-soft px-[13px] py-1.5 text-xs font-semibold text-brand-ink hover:border-brand"
          >
            <span className="hidden md:inline">{email || "My account"}</span>
            <span className="md:hidden">My account</span>
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-lg border border-line bg-transparent px-[13px] py-2 text-[13px] font-semibold text-ink hover:border-ink hover:bg-soft"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1360px] flex-1 px-[18px] pb-10">{children}</main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-semibold text-muted transition-colors hover:bg-paper hover:text-ink"
    >
      {children}
    </Link>
  );
}
