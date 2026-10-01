import type { Metadata } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pageTitle } from "@/lib/branding";
import { isRole, type StaffRow } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { StaffManager } from "./staff-manager";

export const metadata: Metadata = {
  title: pageTitle("Users"),
};

export default async function UsersPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub ?? "";
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();

  if (profile?.role !== "admin") {
    return (
      <Shell>
        <Notice>Only administrators can manage users.</Notice>
      </Shell>
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return (
      <Shell>
        <div className="space-y-3 rounded-[10px] border border-line bg-white p-5 text-sm leading-relaxed text-ink">
          <p className="font-semibold">One-time setup needed</p>
          <p>
            Adding people and resetting passwords needs your Supabase project&apos;s <b>secret key</b>. It stays on the
            server and is never sent to browsers.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              In Supabase, open <b>Project Settings → API Keys</b> and copy a <b>secret key</b> (it starts with{" "}
              <code className="rounded bg-soft px-1">sb_secret_</code>), or the legacy <b>service_role</b> key.
            </li>
            <li>
              Add it to <code className="rounded bg-soft px-1">.env.local</code> (and your hosting provider&apos;s
              environment variables) as <code className="rounded bg-soft px-1">SUPABASE_SECRET_KEY=…</code>
            </li>
            <li>Restart the app.</li>
          </ol>
          <p className="text-muted">Never share this key or put it in a variable starting with NEXT_PUBLIC_.</p>
        </div>
      </Shell>
    );
  }

  const staff = await loadStaff(admin);
  if (!staff) {
    return (
      <Shell>
        <Notice>Users couldn&apos;t be loaded. Check that SUPABASE_SECRET_KEY is correct, then refresh.</Notice>
      </Shell>
    );
  }

  return (
    <Shell>
      <StaffManager staff={staff} currentUserId={userId} />
    </Shell>
  );
}

/** Every sign-in account with its staff profile (if any), or null if they can't be read. */
async function loadStaff(admin: SupabaseClient): Promise<StaffRow[] | null> {
  const [{ data: users, error: usersError }, { data: profiles, error: profilesError }] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("profiles").select("id, name, role"),
  ]);
  if (usersError || profilesError) {
    console.error("Failed to load users:", usersError ?? profilesError);
    return null;
  }

  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));
  const now = Date.now();
  return users.users
    .map((u) => {
      const p = byId.get(u.id);
      return {
        id: u.id,
        email: u.email ?? "",
        name: (p?.name as string | undefined) ?? null,
        role: isRole(p?.role) ? p.role : null,
        disabled: Boolean(u.banned_until && Date.parse(u.banned_until) > now),
        lastSignInAt: u.last_sign_in_at ?? null,
        createdAt: u.created_at,
      };
    })
    .sort(byStaffThenName);
}

/** Staff first (by name), then accounts without a profile (by email). */
function byStaffThenName(a: StaffRow, b: StaffRow): number {
  if ((a.name === null) !== (b.name === null)) return a.name === null ? 1 : -1;
  return (a.name ?? a.email).localeCompare(b.name ?? b.email);
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-[-0.025em] text-ink">Users</h1>
        <p className="text-sm text-muted">Who can sign in, and what they can do.</p>
      </div>
      {children}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[10px] border border-line bg-soft px-4 py-3 text-sm text-muted">{children}</div>;
}
