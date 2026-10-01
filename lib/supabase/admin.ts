import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client with the secret (service role) key. It bypasses Row Level
 * Security and can manage sign-in accounts, so it's only for admin-checked
 * Server Actions and pages. Returns null until SUPABASE_SECRET_KEY is set.
 */
export function createAdminClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
