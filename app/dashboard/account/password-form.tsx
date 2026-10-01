"use client";

import { useActionState } from "react";
import { MIN_PASSWORD_LENGTH } from "@/lib/staff";
import { changePassword, type ChangePasswordState } from "./actions";

const input =
  "block w-full appearance-none rounded-[7px] border border-line bg-paper px-2.5 py-[9px] text-[15px] text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand-soft";
const label = "mb-[5px] block text-[11px] font-semibold uppercase tracking-[0.09em] text-muted";

const initialState: ChangePasswordState = {};

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, initialState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.error && (
        <p role="alert" className="rounded-lg border border-req/30 bg-[#fbecea] px-3 py-2 text-sm text-req">
          {state.error}
        </p>
      )}
      {state.saved && (
        <p role="status" className="rounded-lg border border-[#c7dec5] bg-brand-soft px-3 py-2 text-sm text-brand-ink">
          Password changed. Use it next time you sign in.
        </p>
      )}
      <div>
        <label htmlFor="password" className={label}>
          New password
        </label>
        <input id="password" name="password" type="password" autoComplete="new-password" className={input} />
        <p className="mt-[5px] text-[11.5px] text-muted">At least {MIN_PASSWORD_LENGTH} characters.</p>
      </div>
      <div>
        <label htmlFor="confirm" className={label}>
          Type it again
        </label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" className={input} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-brand bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-ink disabled:opacity-60"
      >
        {pending ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}
