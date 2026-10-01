import { STATUS_HINTS, STATUS_LABELS, STATUS_PILL, statusOf } from "@/lib/quotation/status";

export function StatusPill({ status }: { status: string | null | undefined }) {
  const s = statusOf(status);
  return (
    <span
      title={STATUS_HINTS[s]}
      className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_PILL[s]}`}
    >
      {STATUS_LABELS[s]}
    </span>
  );
}
