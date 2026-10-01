// Where a performa invoice stands with the customer.

export const STATUSES = ["draft", "sent", "accepted", "declined"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
};

export const STATUS_HINTS: Record<Status, string> = {
  draft: "Not sent to the customer yet",
  sent: "Waiting for the customer's reply",
  accepted: "The customer accepted it",
  declined: "The customer declined it",
};

/** Pill colours. Always shown with the label, never colour alone. */
export const STATUS_PILL: Record<Status, string> = {
  draft: "border-line bg-soft text-muted",
  sent: "border-sky-200 bg-sky-50 text-sky-800",
  accepted: "border-[#c7dec5] bg-brand-soft text-brand-ink",
  declined: "border-red-200 bg-red-50 text-red-800",
};

export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

/** Rows saved before statuses existed read as drafts. */
export function statusOf(value: unknown): Status {
  return isStatus(value) ? value : "draft";
}
