import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_COMPANY_STATE_CODE } from "@/lib/quotation/calc";
import { findState } from "@/lib/quotation/states";
import { GSTIN_PATTERN, normaliseGstin } from "@/lib/quotation/validate";

// Company and bank details printed on proforma invoices. They live in the
// public.company_settings table and are edited in the "Company details" card
// of the proforma invoice form. The logo and signature images live in the
// private company-assets Storage bucket.

/** Printed when no logo has been uploaded. */
export const COMPANY_LOGO = { src: "/sascan-logo.png", width: 253, height: 49 };

export const COMPANY_ASSETS_BUCKET = "company-assets";
export const MAX_IMAGE_BYTES = 900_000;
export const IMAGE_TYPES = ["image/png", "image/jpeg"];

export type CompanyImageKind = "logo" | "signature";

export type CompanyDetails = {
  name: string;
  addressLines: string[];
  mobile: string;
  email: string;
  gstin: string;
  /** GST state code; customers in the same state pay CGST + SGST. */
  stateCode: string;
  bank: {
    bank: string;
    accountNumber: string;
    ifsc: string;
    branch: string;
  };
  logoPath: string | null;
  signaturePath: string | null;
  /** Short-lived signed URLs for showing the images in the browser. */
  logoUrl: string | null;
  signatureUrl: string | null;
};

/** Used until the company_settings row can be read (e.g. migration not applied yet). */
export const DEFAULT_COMPANY: CompanyDetails = {
  name: "Sascan Meditech Pvt Ltd",
  addressLines: [
    "SCTIMST-TIMed, 5th Floor M S Valiathan Medical Devices Block BMT Wing, Poojapura,",
    "Thiruvananthapuram, Kerala 695012",
  ],
  mobile: "+91 9591345016",
  email: "sascanmeditech@gmail.com",
  gstin: "32AAVCS9773L1ZB",
  stateCode: DEFAULT_COMPANY_STATE_CODE,
  bank: {
    bank: "HDFC",
    accountNumber: "59209591345016",
    ifsc: "HDFC0005235",
    branch: "HDFC Pappanamcode, Trivandrum",
  },
  logoPath: null,
  signaturePath: null,
  logoUrl: null,
  signatureUrl: null,
};

/** The editable text columns of company_settings. */
export type CompanySettingsRow = {
  name: string;
  address: string;
  mobile: string;
  email: string;
  gstin: string;
  state_code: string;
  bank_name: string;
  account_number: string;
  ifsc: string;
  bank_branch: string;
};

type StoredCompanyRow = CompanySettingsRow & { logo_path: string | null; signature_path: string | null };

const COLUMNS =
  "name, address, mobile, email, gstin, state_code, bank_name, account_number, ifsc, bank_branch, logo_path, signature_path";
const SIGNED_URL_SECONDS = 60 * 60;

export async function getCompanyDetails(
  supabase: SupabaseClient,
  { signUrls = true }: { signUrls?: boolean } = {},
): Promise<CompanyDetails> {
  const { data, error } = await supabase.from("company_settings").select(COLUMNS).maybeSingle();
  if (error) {
    console.error("Failed to load company settings, using defaults:", error);
    return DEFAULT_COMPANY;
  }
  if (!data) return DEFAULT_COMPANY;

  const row = data as StoredCompanyRow;
  const company: CompanyDetails = {
    ...rowToCompany(row),
    logoPath: row.logo_path,
    signaturePath: row.signature_path,
  };

  return signUrls ? signCompanyImages(supabase, company) : company;
}

/** Adds short-lived URLs for showing the company's logo and signature in the browser. */
export async function signCompanyImages(supabase: SupabaseClient, company: CompanyDetails): Promise<CompanyDetails> {
  const paths = [company.logoPath, company.signaturePath].filter((p): p is string => Boolean(p));
  if (paths.length === 0) return { ...company, logoUrl: null, signatureUrl: null };

  const { data: signed, error } = await supabase.storage
    .from(COMPANY_ASSETS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (error) console.error("Failed to sign company image URLs:", error);
  const urlFor = (path: string | null) => (path && signed?.find((s) => s.path === path)?.signedUrl) || null;
  return { ...company, logoUrl: urlFor(company.logoPath), signatureUrl: urlFor(company.signaturePath) };
}

export function rowToCompany(row: CompanySettingsRow): CompanyDetails {
  return {
    name: row.name,
    addressLines: splitLines(row.address),
    mobile: row.mobile,
    email: row.email,
    gstin: row.gstin,
    stateCode: row.state_code,
    bank: {
      bank: row.bank_name,
      accountNumber: row.account_number,
      ifsc: row.ifsc,
      branch: row.bank_branch,
    },
    logoPath: null,
    signaturePath: null,
    logoUrl: null,
    signatureUrl: null,
  };
}

// ---------------------------------------------------------------------------
// Snapshots: the company details an invoice was saved with
// ---------------------------------------------------------------------------

/** Stored in invoices.company_snapshot. Image paths point into the company-assets bucket. */
export type CompanySnapshot = {
  v: 1;
  name: string;
  addressLines: string[];
  mobile: string;
  email: string;
  gstin: string;
  stateCode: string;
  bank: CompanyDetails["bank"];
  logoPath: string | null;
  signaturePath: string | null;
};

export function companyToSnapshot(company: CompanyDetails): CompanySnapshot {
  return {
    v: 1,
    name: company.name,
    addressLines: company.addressLines,
    mobile: company.mobile,
    email: company.email,
    gstin: company.gstin,
    stateCode: company.stateCode,
    bank: { ...company.bank },
    logoPath: company.logoPath,
    signaturePath: company.signaturePath,
  };
}

/**
 * The company details to print on a saved invoice: its snapshot, or `current`
 * for an invoice saved before snapshots existed (or with an unreadable one).
 * Image URLs are not signed here; use signCompanyImages for the browser.
 */
export function companyForInvoice(snapshot: unknown, current: CompanyDetails): CompanyDetails {
  const snap = snapshot as Partial<CompanySnapshot> | null;
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  if (!snap || typeof snap !== "object" || snap.v !== 1 || !str(snap.name) || !snap.bank) return current;

  const bank = snap.bank as Partial<CompanyDetails["bank"]>;
  return {
    name: str(snap.name) ?? "",
    addressLines: Array.isArray(snap.addressLines) ? snap.addressLines.filter((l): l is string => typeof l === "string") : [],
    mobile: str(snap.mobile) ?? "",
    email: str(snap.email) ?? "",
    gstin: str(snap.gstin) ?? "",
    stateCode: str(snap.stateCode) ?? current.stateCode,
    bank: {
      bank: str(bank.bank) ?? "",
      accountNumber: str(bank.accountNumber) ?? "",
      ifsc: str(bank.ifsc) ?? "",
      branch: str(bank.branch) ?? "",
    },
    logoPath: str(snap.logoPath),
    signaturePath: str(snap.signaturePath),
    logoUrl: null,
    signatureUrl: null,
  };
}

export type CompanyImages = {
  logo: { data: Buffer; format: "png" | "jpg" } | null;
  signature: { data: Buffer; format: "png" | "jpg" } | null;
};

/** The uploaded images as bytes, for the PDF. Missing or unreadable images are skipped. */
export async function getCompanyImages(supabase: SupabaseClient, company: CompanyDetails): Promise<CompanyImages> {
  const load = async (path: string | null) => {
    if (!path) return null;
    const { data, error } = await supabase.storage.from(COMPANY_ASSETS_BUCKET).download(path);
    if (error || !data) {
      console.error(`Failed to load company image ${path}:`, error);
      return null;
    }
    const format: "png" | "jpg" = data.type === "image/png" || path.endsWith(".png") ? "png" : "jpg";
    return { data: Buffer.from(await data.arrayBuffer()), format };
  };
  const [logo, signature] = await Promise.all([load(company.logoPath), load(company.signaturePath)]);
  return { logo, signature };
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

export type CompanyField =
  | "name"
  | "address"
  | "mobile"
  | "email"
  | "gstin"
  | "stateCode"
  | "bankName"
  | "accountNumber"
  | "ifsc"
  | "bankBranch";

export const COMPANY_FIELDS: CompanyField[] = [
  "name",
  "address",
  "mobile",
  "email",
  "gstin",
  "stateCode",
  "bankName",
  "accountNumber",
  "ifsc",
  "bankBranch",
];

export type CompanyInput = Record<CompanyField, string>;
export type CompanyFieldErrors = Partial<Record<CompanyField, string>>;

export function companyToInput(company: CompanyDetails): CompanyInput {
  return {
    name: company.name,
    address: company.addressLines.join("\n"),
    mobile: company.mobile,
    email: company.email,
    gstin: company.gstin,
    stateCode: company.stateCode,
    bankName: company.bank.bank,
    accountNumber: company.bank.accountNumber,
    ifsc: company.bank.ifsc,
    bankBranch: company.bank.branch,
  };
}

/** What's typed, as it would print, with the images of `base`. Used for the live preview. */
export function inputToCompany(input: CompanyInput, base: CompanyDetails): CompanyDetails {
  return {
    ...base,
    name: input.name.trim(),
    addressLines: splitLines(input.address),
    mobile: input.mobile.trim(),
    email: input.email.trim(),
    gstin: normaliseGstin(input.gstin),
    stateCode: input.stateCode,
    bank: {
      bank: input.bankName.trim(),
      accountNumber: input.accountNumber.trim(),
      ifsc: input.ifsc.trim().toUpperCase(),
      branch: input.bankBranch.trim(),
    },
  };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_PATTERN = /^[0-9]{6,20}$/;
const MAX_LENGTH = 200;
const MAX_ADDRESS_LINES = 4;

export function validateCompany(
  raw: CompanyInput,
): { ok: true; row: CompanySettingsRow } | { ok: false; errors: CompanyFieldErrors } {
  const errors: CompanyFieldErrors = {};
  const value = (field: CompanyField) => (typeof raw?.[field] === "string" ? raw[field] : "");
  const text = (field: CompanyField, label: string) => {
    const v = value(field).trim();
    if (!v) errors[field] = `Enter the ${label}.`;
    else if (v.length > MAX_LENGTH) errors[field] = `Keep the ${label} under ${MAX_LENGTH} characters.`;
    return v;
  };

  const name = text("name", "company name");
  const mobile = text("mobile", "mobile number");
  const bankName = text("bankName", "bank name");
  const bankBranch = text("bankBranch", "branch");

  const addressLines = splitLines(value("address"));
  if (addressLines.length === 0) errors.address = "Enter the address.";
  else if (addressLines.length > MAX_ADDRESS_LINES) errors.address = `Use at most ${MAX_ADDRESS_LINES} lines.`;
  else if (addressLines.some((line) => line.length > MAX_LENGTH)) errors.address = "One of the lines is too long.";

  const email = value("email").trim();
  if (!EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address.";

  const gstin = normaliseGstin(value("gstin"));
  if (!GSTIN_PATTERN.test(gstin)) errors.gstin = "Enter a valid 15-character GSTIN.";

  const state = findState(value("stateCode"));
  if (!state) errors.stateCode = "Select the company's state.";

  const accountNumber = value("accountNumber").replace(/\s+/g, "");
  if (!ACCOUNT_PATTERN.test(accountNumber)) errors.accountNumber = "Enter the account number (digits only).";

  const ifsc = value("ifsc").replace(/\s+/g, "").toUpperCase();
  if (!IFSC_PATTERN.test(ifsc)) errors.ifsc = "Enter a valid 11-character IFSC code, e.g. HDFC0005235.";

  if (Object.keys(errors).length > 0 || !state) return { ok: false, errors };
  return {
    ok: true,
    row: {
      name,
      address: addressLines.join("\n"),
      mobile,
      email,
      gstin,
      state_code: state.code,
      bank_name: bankName,
      account_number: accountNumber,
      ifsc,
      bank_branch: bankBranch,
    },
  };
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
