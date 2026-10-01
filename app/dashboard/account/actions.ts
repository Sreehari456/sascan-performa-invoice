"use server";

import { createClient } from "@/lib/supabase/server";
import { MIN_PASSWORD_LENGTH, validatePassword } from "@/lib/staff";

export type ChangePasswordState = { error?: string; saved?: boolean };

/** Changes the signed-in user's own password. */
export async function changePassword(_prev: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  const password = validatePassword(formData.get("password"));
  if (!password) return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  if (formData.get("confirm") !== password) return { error: "The two passwords don't match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    switch (error.code) {
      case "same_password":
        return { error: "That's your current password. Choose a new one." };
      case "weak_password":
        return { error: "That password is too easy to guess. Try a longer one." };
      case "reauthentication_needed":
        return { error: "For security, sign out and sign in again, then change your password straight away." };
    }
    console.error("Failed to change password:", error);
    return { error: "Your password couldn't be changed. Please try again." };
  }
  return { saved: true };
}
