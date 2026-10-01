"use client";

import { useState, useTransition } from "react";
import { STATUSES, STATUS_HINTS, STATUS_LABELS, STATUS_PILL, type Status } from "@/lib/quotation/status";
import { setQuotationStatus } from "./actions";

/** The quotation's status as a row of buttons; the current one is pressed. */
export function StatusControl({ id, status: initial }: { id: string; status: Status }) {
  const [status, setStatus] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function choose(next: Status) {
    if (next === status) return;
    const previous = status;
    setStatus(next); // optimistic
    setError(null);
    startSaving(async () => {
      const result = await setQuotationStatus(id, next);
      if (!result.ok) {
        setStatus(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Status</span>
      <div role="group" aria-label="Status" className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => {
          const active = s === status;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={active}
              title={STATUS_HINTS[s]}
              disabled={saving}
              onClick={() => choose(s)}
              className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors disabled:cursor-wait ${
                active ? STATUS_PILL[s] : "border-line bg-white text-muted hover:border-ink hover:text-ink"
              }`}
            >
              {active && <span aria-hidden>✓ </span>}
              {STATUS_LABELS[s]}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="text-xs text-req">
          {error}
        </p>
      )}
    </div>
  );
}
