"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  error?: string;
  email?: string;
};

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password.", email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: loginErrorMessage(error.code, error.status), email };
  }

  redirect("/dashboard");
}

function loginErrorMessage(code?: string, status?: number): string {
  switch (code) {
    case "invalid_credentials":
      return "Incorrect email or password. Please try again.";
    case "email_not_confirmed":
      return "This email address hasn't been confirmed yet. Contact your administrator.";
    case "user_banned":
      return "This account has been disabled. Contact your administrator.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many sign-in attempts. Please wait a few minutes and try again.";
  }
  if (status === 429) {
    return "Too many sign-in attempts. Please wait a few minutes and try again.";
  }
  return "We couldn't sign you in right now. Please try again shortly.";
}
