// Staff accounts: a Supabase sign-in account plus a row in public.profiles.

export const ROLES = ["admin", "accounts"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin — everything, including company details and users",
  accounts: "Accounts — proforma invoices, customers and products",
};

export const MIN_PASSWORD_LENGTH = 8;

export type StaffRow = {
  id: string;
  email: string;
  /** null = can sign in but has no staff profile, so can't use the app yet. */
  name: string | null;
  role: Role | null;
  disabled: boolean;
  lastSignInAt: string | null;
  createdAt: string;
};

export type StaffInput = { name: string; email: string; role: string; password: string };
export type StaffFieldErrors = Partial<Record<keyof StaffInput, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function validateName(value: unknown): string | null {
  const name = typeof value === "string" ? value.trim() : "";
  return name && name.length <= 100 ? name : null;
}

export function validatePassword(value: unknown): string | null {
  return typeof value === "string" && value.length >= MIN_PASSWORD_LENGTH && value.length <= 72 ? value : null;
}

export function validateStaff(
  raw: StaffInput,
): { ok: true; data: { name: string; email: string; role: Role; password: string } } | { ok: false; errors: StaffFieldErrors } {
  const errors: StaffFieldErrors = {};
  const name = validateName(raw?.name);
  if (!name) errors.name = "Enter their name.";

  const email = typeof raw?.email === "string" ? raw.email.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address.";

  if (!isRole(raw?.role)) errors.role = "Choose a role.";

  const password = validatePassword(raw?.password);
  if (!password) errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;

  if (!name || !password || !isRole(raw.role) || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { name, email, role: raw.role, password } };
}

// No 0/O, 1/l/I: easy to read out or type from a message.
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A random temporary password in readable groups, e.g. "h7Kq-2mXa-Rt9p". */
export function generatePassword(): string {
  const random = new Uint32Array(12);
  crypto.getRandomValues(random);
  const chars = Array.from(random, (n) => PASSWORD_ALPHABET[n % PASSWORD_ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}
