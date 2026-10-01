"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/quotation/queries";
import {
  MIN_PASSWORD_LENGTH,
  isRole,
  validateName,
  validatePassword,
  validateStaff,
  type StaffFieldErrors,
  type StaffInput,
} from "@/lib/staff";

type Fail = { ok: false; error: string; fieldErrors?: StaffFieldErrors };
type Admin = { admin: SupabaseClient; userId: string };

/** Disabling = a ban that never practically ends. */
const DISABLED_FOR = "876000h"; // 100 years

/** The signed-in user, if they're an admin, plus a client that can manage accounts. */
async function requireAdmin(): Promise<Admin | Fail> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return { ok: false, error: "Your session has expired. Sign in again and retry." };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (profile?.role !== "admin") return { ok: false, error: "Only administrators can manage users." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "User management isn't set up: add SUPABASE_SECRET_KEY to the server's environment." };
  return { admin, userId };
}

function isFail(value: Admin | Fail): value is Fail {
  return "ok" in value;
}

function done() {
  revalidatePath("/dashboard/users");
  return { ok: true as const };
}

/** Creates a sign-in account and its staff profile. The admin passes the password on to them. */
export async function addStaff(input: StaffInput): Promise<{ ok: true } | Fail> {
  const result = validateStaff(input);
  if (!result.ok) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: result.errors };
  const ctx = await requireAdmin();
  if (isFail(ctx)) return ctx;
  const { name, email, role, password } = result.data;

  const { data, error } = await ctx.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // they sign in with the password they're given; no confirmation email
    user_metadata: { name },
  });
  if (error || !data.user) {
    if (error?.code === "email_exists" || error?.status === 422) {
      const message = "Someone with this email can already sign in. Find them in the list below.";
      return { ok: false, error: message, fieldErrors: { email: message } };
    }
    console.error("Failed to create user:", error);
    return { ok: false, error: "The account couldn't be created. Please try again." };
  }

  const { error: profileError } = await ctx.admin.from("profiles").insert({ id: data.user.id, name, email, role });
  if (profileError) {
    // Don't leave an account behind that can sign in but can't use the app.
    await ctx.admin.auth.admin.deleteUser(data.user.id);
    console.error("Failed to create profile:", profileError);
    return { ok: false, error: "The account couldn't be created. Please try again." };
  }
  return done();
}

/** Gives an existing sign-in account (e.g. made in the Supabase dashboard) a staff profile. */
export async function addProfile(userId: string, name: string, role: string): Promise<{ ok: true } | Fail> {
  if (!isUuid(userId)) return { ok: false, error: "Invalid user." };
  const validName = validateName(name);
  if (!validName) return { ok: false, error: "Enter their name.", fieldErrors: { name: "Enter their name." } };
  if (!isRole(role)) return { ok: false, error: "Choose a role." };
  const ctx = await requireAdmin();
  if (isFail(ctx)) return ctx;

  const { data, error } = await ctx.admin.auth.admin.getUserById(userId);
  if (error || !data.user?.email) return { ok: false, error: "That account no longer exists." };

  const { error: insertError } = await ctx.admin
    .from("profiles")
    .insert({ id: userId, name: validName, email: data.user.email, role });
  if (insertError) {
    console.error("Failed to add profile:", insertError);
    return { ok: false, error: "The profile couldn't be added. Please try again." };
  }
  return done();
}

/** Changes someone's name or role. Admins can't change their own role, so there's always one admin. */
export async function updateStaff(userId: string, name: string, role: string): Promise<{ ok: true } | Fail> {
  if (!isUuid(userId)) return { ok: false, error: "Invalid user." };
  const validName = validateName(name);
  if (!validName) return { ok: false, error: "Enter their name.", fieldErrors: { name: "Enter their name." } };
  if (!isRole(role)) return { ok: false, error: "Choose a role." };
  const ctx = await requireAdmin();
  if (isFail(ctx)) return ctx;

  const { data: current } = await ctx.admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (!current) return { ok: false, error: "That person has no staff profile." };
  if (userId === ctx.userId && current.role !== role) {
    return { ok: false, error: "You can't change your own role. Ask another administrator." };
  }

  const { error } = await ctx.admin.from("profiles").update({ name: validName, role }).eq("id", userId);
  if (error) {
    console.error("Failed to update profile:", error);
    return { ok: false, error: "The changes couldn't be saved. Please try again." };
  }
  return done();
}

/** Sets a new password, e.g. when someone has forgotten theirs. */
export async function resetPassword(userId: string, password: string): Promise<{ ok: true } | Fail> {
  if (!isUuid(userId)) return { ok: false, error: "Invalid user." };
  const valid = validatePassword(password);
  if (!valid) return { ok: false, error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  const ctx = await requireAdmin();
  if (isFail(ctx)) return ctx;

  const { error } = await ctx.admin.auth.admin.updateUserById(userId, { password: valid });
  if (error) {
    console.error("Failed to reset password:", error);
    return { ok: false, error: "The password couldn't be changed. Please try again." };
  }
  return done();
}

/**
 * Stops (or allows again) someone signing in. Their invoices stay, with their
 * name on them. Already-open sessions end within the hour, when they expire.
 */
export async function setDisabled(userId: string, disabled: boolean): Promise<{ ok: true } | Fail> {
  if (!isUuid(userId)) return { ok: false, error: "Invalid user." };
  const ctx = await requireAdmin();
  if (isFail(ctx)) return ctx;
  if (userId === ctx.userId) return { ok: false, error: "You can't disable your own account." };

  const { error } = await ctx.admin.auth.admin.updateUserById(userId, {
    ban_duration: disabled ? DISABLED_FOR : "none",
  });
  if (error) {
    console.error("Failed to change account status:", error);
    return { ok: false, error: "The account couldn't be updated. Please try again." };
  }
  return done();
}
