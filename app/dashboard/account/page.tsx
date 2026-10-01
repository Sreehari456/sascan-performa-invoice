import type { Metadata } from "next";
import { pageTitle } from "@/lib/branding";
import { createClient } from "@/lib/supabase/server";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = {
  title: pageTitle("My account"),
};

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub ?? "";
  const email = typeof auth?.claims?.email === "string" ? auth.claims.email : "";
  const { data: profile } = await supabase.from("profiles").select("name, role").eq("id", userId).maybeSingle();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-[-0.025em] text-ink">My account</h1>
        <p className="text-sm text-muted">
          {profile?.name ? `${profile.name} · ` : ""}
          {email}
          {profile?.role ? ` · ${profile.role === "admin" ? "Admin" : "Accounts"}` : ""}
        </p>
      </div>
      <section className="rounded-[10px] border border-line bg-white p-5">
        <h2 className="mb-4 text-[15px] font-bold">Change password</h2>
        <PasswordForm />
      </section>
    </div>
  );
}
