"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800"
        >
          {state.error}
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          aria-invalid={Boolean(state.error)}
          className="block w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20 sm:text-sm"
          placeholder="you@sascan.in"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-sm font-medium text-slate-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(state.error)}
          className="block w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900 shadow-sm focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-600/20 sm:text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending && (
          <span
            aria-hidden
            className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
          />
        )}
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
