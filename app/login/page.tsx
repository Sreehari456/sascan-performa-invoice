import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_TITLE, pageTitle } from "@/lib/branding";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: pageTitle("Sign in"),
};

export default async function LoginPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-full flex-1 bg-slate-50">
      {/* Brand panel: desktop only */}
      <aside className="relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden bg-sky-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <BrandMark className="size-9" />
          <span className="text-lg font-semibold tracking-tight">Sascan</span>
        </div>

        <div className="space-y-4">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            {DOCUMENT_TITLE}
          </h2>
          <p className="max-w-sm text-base leading-relaxed text-sky-100/80">
            Create, manage and track performa invoices for Sascan&apos;s customers in one place.
          </p>
        </div>

        <p className="text-sm text-sky-100/60">
          Internal use only. Authorised personnel.
        </p>

        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full border-[48px] border-white/5"
        />
      </aside>

      {/* Form panel */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark className="size-9 text-sky-800" />
            <div>
              <p className="text-base font-semibold leading-tight text-slate-900">Sascan</p>
              <p className="text-sm leading-tight text-slate-500">{DOCUMENT_TITLE}</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6 space-y-1.5">
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                Sign in
              </h1>
              <p className="text-sm text-slate-500">
                Use your Sascan account to continue.
              </p>
            </div>
            <LoginForm />
          </div>

          <p className="mt-6 text-center text-sm text-slate-500">
            Need access? Contact your administrator.
          </p>
        </div>
      </main>
    </div>
  );
}

function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" fill="none" aria-hidden className={className}>
      <rect width="36" height="36" rx="8" fill="currentColor" fillOpacity="0.15" />
      <path
        d="M10 18h4l2.5-6 4 12 2.5-6h3"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
