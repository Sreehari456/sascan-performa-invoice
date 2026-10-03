"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  COMPANY_FIELDS,
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  companyToInput,
  inputToCompany,
  type CompanyDetails,
  type CompanyField,
  type CompanyFieldErrors,
  type CompanyImageKind,
  type CompanyInput,
} from "@/lib/company";
import { DOCUMENT_TITLE } from "@/lib/branding";
import { matchCustomers, type CustomerRow } from "@/lib/customers";
import { itemMatchesProduct, matchProducts, plainDecimal, type ProductRow } from "@/lib/products";
import {
  computeLine,
  hundredthsToDecimal,
  parseHundredths,
  sumLines,
  taxModeFor,
  type LineAmounts,
} from "@/lib/quotation/calc";
import { DEFAULT_GST_RATE, DEFAULT_ITEM, DEFAULT_TERMS, GST_RATES } from "@/lib/quotation/defaults";
import { formatQuotationDate, formatRupees } from "@/lib/quotation/format";
import { quotationPdfFilename } from "@/lib/quotation/layout";
import { DEFAULT_NUMBER_PREFIX, financialYearFor, formatQuotationNumber } from "@/lib/quotation/numbering";
import { toHundredths, type QuotationListRow, type QuotationRow } from "@/lib/quotation/queries";
import { INDIAN_STATES, findState } from "@/lib/quotation/states";
import {
  GSTIN_PATTERN,
  normaliseGstin,
  validateQuotation,
  type FieldErrors,
  type LineItemInput,
  type QuotationInput,
} from "@/lib/quotation/validate";
import { QuotationPaper } from "../[id]/quotation-preview";
import { StatusPill } from "../status-pill";
import { downloadQuotationPdf } from "../pdf-download";
import {
  exportBackup,
  importBackup,
  nextSequenceNo,
  openQuotation,
  removeCompanyImage,
  removeQuotation,
  saveCompanyDetails,
  saveQuotation,
  uploadCompanyImage,
} from "./actions";
import { saveItemAsProduct } from "../../products/actions";
import type { BackupFile } from "./backup";
import { SuggestInput } from "./suggest-input";

type ItemState = LineItemInput & { id: string };
type Terms = typeof DEFAULT_TERMS;

/** Everything in cards 2–4, i.e. one quotation. Also what the draft stores. */
type QuotationState = {
  /** Set when a saved quotation was opened; saving then overwrites it. */
  editingId: string | null;
  numberPrefix: string;
  financialYear: string;
  sequenceNo: string;
  quotationDate: string;
  /** The saved customer picked from the suggestions; cleared when the name is retyped. */
  customerId: string | null;
  customerName: string;
  customerAddress: string;
  customerGstin: string;
  customerStateCode: string;
  items: ItemState[];
  terms: Terms;
};

const ZERO = BigInt(0);
const ZERO_LINE: LineAmounts = { taxable: ZERO, cgst: ZERO, sgst: ZERO, igst: ZERO, total: ZERO };
const PAPER_WIDTH = 794; // A4 at 96 dpi
const DRAFT_KEY = "sascan-quotation-draft";

const inputBase =
  "block w-full appearance-none rounded-[7px] border bg-paper px-2.5 py-[9px] text-[15px] text-ink placeholder:text-muted/60 focus:outline-none focus:ring-[3px] disabled:bg-soft disabled:text-muted";
const inputOk = "border-line focus:border-brand focus:ring-brand-soft";
const inputBad = "border-req ring-[3px] ring-[#fbecea] focus:border-req focus:ring-[#fbecea]";
const selectArrow =
  "bg-[length:5px_5px,5px_5px] bg-[position:calc(100%-17px)_52%,calc(100%-12px)_52%] bg-no-repeat pr-[34px] [background-image:linear-gradient(45deg,transparent_50%,var(--color-muted)_50%),linear-gradient(135deg,var(--color-muted)_50%,transparent_50%)]";
const ghostButton =
  "rounded-lg border border-line bg-transparent px-[13px] py-2 text-[13px] font-semibold text-ink hover:border-ink hover:bg-soft disabled:opacity-50";
const primarySmall =
  "rounded-lg border border-brand bg-brand px-[13px] py-2 text-[13px] font-semibold text-white hover:bg-brand-ink disabled:opacity-60";

function newItemId(): string {
  return `item-${crypto.randomUUID()}`;
}

function emptyItem(id: string): ItemState {
  return { id, itemName: "", shortDescription: "", description: "", hsnCode: "", quantity: "1", rate: "", gstRate: DEFAULT_GST_RATE };
}

function customerFields(c: CustomerRow | null) {
  return {
    customerId: c?.id ?? null,
    customerName: c?.name ?? "",
    customerAddress: c?.address ?? "",
    customerGstin: c?.gstin ?? "URP",
    customerStateCode: c?.state_code ?? "",
  };
}

function initialQuotation(today: string, sequenceNo: number | null, customer: CustomerRow | null): QuotationState {
  return {
    editingId: null,
    numberPrefix: DEFAULT_NUMBER_PREFIX,
    financialYear: financialYearFor(today),
    sequenceNo: sequenceNo ? String(sequenceNo) : "",
    quotationDate: today,
    ...customerFields(customer),
    items: [{ id: "item-1", ...DEFAULT_ITEM }],
    terms: DEFAULT_TERMS,
  };
}

function rowToState(row: QuotationRow): QuotationState {
  return {
    editingId: row.id,
    numberPrefix: row.number_prefix,
    financialYear: row.financial_year ?? financialYearFor(row.invoice_date),
    sequenceNo: row.sequence_no ? String(row.sequence_no) : "",
    quotationDate: row.invoice_date,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerAddress: row.customer_address,
    customerGstin: row.customer_gst ?? "URP",
    customerStateCode: row.customer_state_code ?? "",
    items: row.invoice_items.map((item) => ({
      id: item.id,
      itemName: item.item_name ?? "",
      shortDescription: item.short_description ?? "",
      description: item.description,
      hsnCode: item.hsn_code ?? "",
      quantity: plainDecimal(item.quantity),
      rate: plainDecimal(item.rate),
      gstRate: plainDecimal(item.gst_rate),
    })),
    terms: {
      paymentTerms: row.payment_terms ?? "",
      extendedWarranty: row.extended_warranty ?? "",
      deliveryTerms: row.delivery_terms ?? "",
      validity: row.validity ?? "",
    },
  };
}

function readDraft(userId: string): QuotationState | null {
  try {
    const raw = localStorage.getItem(`${DRAFT_KEY}:${userId}`);
    const draft = raw ? (JSON.parse(raw) as QuotationState) : null;
    if (!draft || !Array.isArray(draft.items) || draft.items.length === 0) return null;
    return { ...draft, customerId: draft.customerId ?? null }; // drafts from before customers existed
  } catch {
    return null;
  }
}

export function QuotationForm({
  today,
  initialSequenceNo,
  recent,
  savedCount,
  company: initialCompany,
  canEditCompany,
  userId,
  opened,
  customers,
  presetCustomer,
  products,
}: {
  today: string;
  initialSequenceNo: number | null;
  recent: QuotationListRow[];
  savedCount: number;
  company: CompanyDetails;
  canEditCompany: boolean;
  userId: string;
  /** A saved quotation opened with ?edit=<id>. */
  opened: QuotationRow | null;
  /** Saved customers, for suggestions. */
  customers: CustomerRow[];
  /** A customer chosen with ?customer=<id> (from the Customers page). */
  presetCustomer: CustomerRow | null;
  /** Saved products, for item suggestions. */
  products: ProductRow[];
}) {
  // ---- Company (card 1) ----
  const [savedCompany, setSavedCompany] = useState(initialCompany);
  const [companyInput, setCompanyInput] = useState<CompanyInput>(() => companyToInput(initialCompany));
  const [companyErrors, setCompanyErrors] = useState<CompanyFieldErrors>({});
  const [companyBusy, startCompanyWork] = useTransition();
  const savedCompanyInput = useMemo(() => companyToInput(savedCompany), [savedCompany]);
  const companyDirty = COMPANY_FIELDS.some((f) => companyInput[f] !== savedCompanyInput[f]);
  const previewCompany = useMemo(() => inputToCompany(companyInput, savedCompany), [companyInput, savedCompany]);

  // ---- Quotation (cards 2–4) ----
  const [q, setQ] = useState<QuotationState>(() =>
    opened ? rowToState(opened) : initialQuotation(today, initialSequenceNo, presetCustomer),
  );
  const set = (patch: Partial<QuotationState>) => setQ((current) => ({ ...current, ...patch }));

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [busyAction, setBusyAction] = useState<"save" | "pdf" | null>(null);
  const [listBusy, startListWork] = useTransition();
  const importInput = useRef<HTMLInputElement>(null);

  // ---- Toast ----
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  function showToast(message: string) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }

  // ---- Draft: restore once, then keep it up to date (this device only) ----
  const draftReady = useRef(false);
  useEffect(() => {
    if (draftReady.current) return;
    draftReady.current = true;
    if (opened || presetCustomer) return; // an explicitly opened quotation or chosen customer wins over the draft
    const draft = readDraft(userId);
    if (!draft) return;
    // Restoring after mount keeps the server and first client render identical.
    queueMicrotask(() => {
      setQ((current) => {
        // A new quotation's number may have been taken since; don't go backwards.
        const sameYear = draft.financialYear === current.financialYear;
        const stale = !draft.editingId && sameYear && Number(draft.sequenceNo) < Number(current.sequenceNo);
        return { ...draft, sequenceNo: stale ? current.sequenceNo : draft.sequenceNo };
      });
    });
  }, [opened, presetCustomer, userId]);

  useEffect(() => {
    if (!draftReady.current) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(`${DRAFT_KEY}:${userId}`, JSON.stringify(q));
      } catch {
        // Storage blocked (private mode); the draft just isn't kept.
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, userId]);

  // ---- Derived values ----
  const seq = Number.parseInt(q.sequenceNo, 10);
  const displayNumber = formatQuotationNumber(q.numberPrefix, q.financialYear, Number.isFinite(seq) ? seq : 0);
  const state = findState(q.customerStateCode);
  const companyStateCode = companyInput.stateCode;
  const taxMode = state ? taxModeFor(state.code, companyStateCode) : null;

  const lineAmounts = useMemo(
    () =>
      q.items.map((item) => {
        const quantity = parseHundredths(item.quantity);
        const rate = parseHundredths(item.rate);
        const gstRate = parseHundredths(item.gstRate);
        if (quantity === null || rate === null) return ZERO_LINE;
        // Until a state is chosen, show taxable value only.
        return computeLine(quantity, rate, taxMode && gstRate !== null ? gstRate : ZERO, taxMode ?? "inter");
      }),
    [q.items, taxMode],
  );
  const totals = sumLines(lineAmounts);

  const normalisedGstin = normaliseGstin(q.customerGstin);
  const gstinStateMismatch =
    state && GSTIN_PATTERN.test(normalisedGstin) && normalisedGstin.slice(0, 2) !== state.code;

  // Live preview: the same sheet the View page and PDF show, built from what's typed.
  const previewRow = useMemo<QuotationRow>(() => {
    const money = hundredthsToDecimal;
    return {
      id: "preview",
      invoice_number: displayNumber,
      number_prefix: q.numberPrefix,
      financial_year: q.financialYear,
      sequence_no: Number.isFinite(seq) ? seq : null,
      invoice_date: q.quotationDate,
      customer_name: q.customerName,
      customer_address: q.customerAddress,
      customer_gst: GSTIN_PATTERN.test(normalisedGstin) ? normalisedGstin : null,
      customer_state: state?.name ?? null,
      customer_state_code: state?.code ?? null,
      company_state_code: companyStateCode,
      company_snapshot: null,
      customer_id: q.customerId,
      subtotal: money(totals.taxable),
      cgst_amount: money(totals.cgst),
      sgst_amount: money(totals.sgst),
      igst_amount: money(totals.igst),
      gst_amount: money(totals.cgst + totals.sgst + totals.igst),
      total_amount: money(totals.total),
      payment_terms: q.terms.paymentTerms,
      extended_warranty: q.terms.extendedWarranty,
      delivery_terms: q.terms.deliveryTerms,
      validity: q.terms.validity,
      created_by: "",
      status: "draft",
      status_changed_at: null,
      invoice_items: q.items.map((item, i) => {
        const amounts = lineAmounts[i];
        return {
          id: item.id,
          line_no: i + 1,
          item_name: item.itemName,
          short_description: item.shortDescription || null,
          description: item.description,
          hsn_code: item.hsnCode || null,
          quantity: money(parseHundredths(item.quantity) ?? ZERO),
          rate: money(parseHundredths(item.rate) ?? ZERO),
          gst_rate: taxMode ? money(parseHundredths(item.gstRate) ?? ZERO) : "0",
          amount: money(amounts.taxable),
          cgst_amount: money(amounts.cgst),
          sgst_amount: money(amounts.sgst),
          igst_amount: money(amounts.igst),
          line_total: money(amounts.total),
        };
      }),
    };
  }, [displayNumber, q, seq, normalisedGstin, state, companyStateCode, totals, lineAmounts, taxMode]);

  // ---- Customer ----
  const linkedCustomer = q.customerId ? customers.find((c) => c.id === q.customerId) ?? null : null;
  const typedName = q.customerName.trim().toLowerCase();
  const nameMatch = !linkedCustomer && typedName ? customers.find((c) => c.name.toLowerCase() === typedName) ?? null : null;
  const customerHint = linkedCustomer
    ? "Saved customer. Changes to the address, GSTIN or state are saved to it."
    : nameMatch
      ? "Matches a saved customer, which is updated with these details when you save."
      : typedName
        ? "New customer — added to your customer list when you save."
        : customers.length > 0
          ? "Start typing to pick a saved customer."
          : undefined;

  function pickCustomer(customer: CustomerRow) {
    set(customerFields(customer));
    setFieldErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith("customer"))),
    );
    document.getElementById("customerAddress")?.focus();
  }

  // ---- Products ----
  const [productBusy, startProductWork] = useTransition();

  function pickProduct(itemId: string, index: number, product: ProductRow) {
    setQ((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              itemName: product.name,
              shortDescription: product.short_description,
              description: product.description,
              hsnCode: product.hsn_code ?? "",
              rate: plainDecimal(product.rate),
              gstRate: plainDecimal(product.gst_rate),
            }
          : item,
      ),
    }));
    setFieldErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`items.${index}.`))),
    );
    document.getElementById(`${itemId}-quantity`)?.focus();
  }

  function saveAsProduct(item: ItemState) {
    startProductWork(async () => {
      const result = await saveItemAsProduct({
        name: item.itemName,
        shortDescription: item.shortDescription,
        description: item.description,
        hsnCode: item.hsnCode,
        rate: item.rate,
        gstRate: item.gstRate,
      });
      if (!result.ok) {
        showToast(Object.values(result.fieldErrors ?? {})[0] ?? result.error);
        return;
      }
      showToast(`${result.name} saved to products`);
    });
  }

  // ---- Field helpers ----
  function clearError(key: string) {
    if (fieldErrors[key]) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }

  function updateItem(id: string, index: number, field: keyof LineItemInput, value: string) {
    setQ((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    }));
    clearError(`items.${index}.${field}`);
  }

  function addItem() {
    setQ((current) => ({ ...current, items: [...current.items, emptyItem(newItemId())] }));
    clearError("items");
  }

  function removeItem(id: string) {
    setQ((current) => {
      const items = current.items.filter((item) => item.id !== id);
      // The last line is cleared rather than removed, as on the standalone page.
      return { ...current, items: items.length > 0 ? items : [emptyItem(newItemId())] };
    });
    // Errors are keyed by position, so they'd point at the wrong rows now.
    setFieldErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith("items."))),
    );
  }

  function changeDate(quotationDate: string) {
    clearError("quotationDate");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(quotationDate)) {
      set({ quotationDate });
      return;
    }
    const financialYear = financialYearFor(quotationDate);
    const yearChanged = financialYear !== q.financialYear;
    set({ quotationDate, financialYear });
    // A new quotation in another financial year gets that year's next number.
    if (yearChanged && !q.editingId) {
      nextSequenceNo(financialYear).then((result) => {
        if (result.ok) {
          setQ((current) =>
            current.financialYear === financialYear && !current.editingId
              ? { ...current, sequenceNo: String(result.sequenceNo) }
              : current,
          );
        }
      });
    }
  }

  /** Moves focus to the first field with an error, opening its card. */
  function focusField(id: string | undefined) {
    if (!id) return;
    const el = document.getElementById(id);
    el?.closest("details")?.setAttribute("open", "");
    el?.focus();
  }

  function focusFirstError(errors: FieldErrors) {
    const key = Object.keys(errors)[0];
    if (!key) return;
    const match = key.match(/^items\.(\d+)\.(\w+)$/);
    focusField(match ? `${q.items[Number(match[1])]?.id}-${match[2]}` : key === "items" ? undefined : key);
  }

  // ---- Company actions ----
  async function persistCompany(): Promise<boolean> {
    const result = await saveCompanyDetails(companyInput);
    if (!result.ok) {
      setCompanyErrors(result.fieldErrors ?? {});
      setFormError(result.error);
      const first = Object.keys(result.fieldErrors ?? {})[0];
      focusField(first ? `company-${first}` : "company-name");
      return false;
    }
    setCompanyErrors({});
    setCompanyInput(result.values);
    setSavedCompany((current) => ({ ...inputToCompany(result.values, current) }));
    return true;
  }

  function saveCompany() {
    setFormError(null);
    startCompanyWork(async () => {
      if (await persistCompany()) showToast("Company details saved");
    });
  }

  function changeImage(kind: CompanyImageKind, file: File | undefined) {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return showToast("Use a PNG or JPEG image");
    if (file.size > MAX_IMAGE_BYTES) return showToast("Image too large — use one under 900 KB");
    const form = new FormData();
    form.set("file", file);
    startCompanyWork(async () => {
      const result = await uploadCompanyImage(kind, form);
      if (!result.ok) return showToast(result.error);
      setSavedCompany((current) =>
        kind === "logo"
          ? { ...current, logoPath: result.path, logoUrl: result.url }
          : { ...current, signaturePath: result.path, signatureUrl: result.url },
      );
      showToast(kind === "logo" ? "Logo saved" : "Signature saved");
    });
  }

  function removeImage(kind: CompanyImageKind) {
    startCompanyWork(async () => {
      const result = await removeCompanyImage(kind);
      if (!result.ok) return showToast(result.error);
      setSavedCompany((current) =>
        kind === "logo"
          ? { ...current, logoPath: null, logoUrl: null }
          : { ...current, signaturePath: null, signatureUrl: null },
      );
      showToast(kind === "logo" ? "Logo removed — using the standard logo" : "Signature removed");
    });
  }

  // ---- Quotation actions ----
  function toInput(): QuotationInput {
    return {
      numberPrefix: q.numberPrefix,
      financialYear: q.financialYear,
      sequenceNo: q.sequenceNo,
      customerName: q.customerName,
      customerAddress: q.customerAddress,
      customerStateCode: q.customerStateCode,
      customerGstin: q.customerGstin,
      quotationDate: q.quotationDate,
      items: q.items.map(({ itemName, shortDescription, description, hsnCode, quantity, rate, gstRate }) => ({
        itemName,
        shortDescription,
        description,
        hsnCode,
        quantity,
        rate,
        gstRate,
      })),
      ...q.terms,
    };
  }

  function save(downloadPdf: boolean) {
    const input = toInput();
    const check = validateQuotation(input, companyStateCode);
    if (!check.ok) {
      setFieldErrors(check.errors);
      setFormError("Please fix the highlighted fields.");
      focusFirstError(check.errors);
      return;
    }
    if (downloadPdf && check.data.totals.total === ZERO) {
      showToast("Add at least one item with a rate");
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setBusyAction(downloadPdf ? "pdf" : "save");
    startSaving(async () => {
      // Unsaved company details would otherwise not appear on the saved PDF.
      if (companyDirty && canEditCompany && !(await persistCompany())) return;

      const result = await saveQuotation(input, q.editingId, q.customerId);
      if (!result.ok) {
        setFormError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        focusFirstError(result.fieldErrors ?? {});
        return;
      }
      set({ editingId: result.id, customerId: result.customerId });
      if (!downloadPdf) {
        showToast(`Saved ${result.number}`);
        return;
      }
      try {
        await downloadQuotationPdf(result.id, quotationPdfFilename(check.data.sequenceNo, check.data.customerName));
        showToast(`Saved ${result.number} — PDF downloaded`);
      } catch (error) {
        setFormError(`Saved ${result.number}, but ${error instanceof Error ? error.message : "the PDF couldn't be downloaded."}`);
      }
    });
  }

  function newQuotation() {
    if (!window.confirm(`Start a new ${DOCUMENT_TITLE.toLowerCase()}? Items and terms are kept; customer is cleared.`)) return;
    const financialYear = financialYearFor(today);
    set({
      editingId: null,
      quotationDate: today,
      financialYear,
      ...customerFields(null),
      // The state is kept, as on the standalone page.
      customerStateCode: q.customerStateCode,
    });
    setFieldErrors({});
    setFormError(null);
    startListWork(async () => {
      const result = await nextSequenceNo(financialYear);
      if (result.ok) {
        set({ sequenceNo: String(result.sequenceNo) });
        showToast(`New ${DOCUMENT_TITLE.toLowerCase()} ${formatQuotationNumber(q.numberPrefix, financialYear, result.sequenceNo)}`);
      }
      document.getElementById("customerName")?.focus();
    });
  }

  function open(id: string) {
    startListWork(async () => {
      const result = await openQuotation(id);
      if (!result.ok) return showToast(result.error);
      setQ(rowToState(result.quotation));
      setFieldErrors({});
      setFormError(null);
      showToast(`Loaded ${result.quotation.invoice_number}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function remove(row: QuotationListRow) {
    if (!window.confirm(`Delete saved ${DOCUMENT_TITLE.toLowerCase()} ${row.invoice_number}?`)) return;
    startListWork(async () => {
      const result = await removeQuotation(row.id);
      if (!result.ok) return showToast(result.error);
      if (q.editingId === row.id) set({ editingId: null });
      showToast(`Deleted ${row.invoice_number}`);
    });
  }

  function downloadBackup() {
    startListWork(async () => {
      const result = await exportBackup();
      if (!result.ok) return showToast(result.error);
      const url = URL.createObjectURL(new Blob([JSON.stringify(result.backup, null, 1)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `sascan-quotations-${today}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    });
  }

  async function restoreBackup(file: File | undefined) {
    if (!file) return;
    let backup: BackupFile;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || !Array.isArray(parsed.history)) throw new Error();
      // Images in the file aren't imported, so don't send them.
      const company = parsed.company ? { ...parsed.company } : null;
      if (company) {
        delete company.logo;
        delete company.sig;
      }
      backup = { history: parsed.history, company };
    } catch {
      return showToast("That file is not a valid backup");
    }
    const replaceCompany =
      Boolean(backup.company) &&
      canEditCompany &&
      window.confirm("Also replace company details with the ones in the backup?");

    startListWork(async () => {
      const result = await importBackup(backup, replaceCompany);
      if (!result.ok) return showToast(result.error);
      if (result.company) {
        const values = result.company;
        setCompanyInput(values);
        setSavedCompany((current) => inputToCompany(values, current));
      }
      const parts = [`${result.imported} imported`];
      if (result.skipped) parts.push(`${result.skipped} already saved`);
      if (result.failed.length) parts.push(`${result.failed.length} skipped (invalid)`);
      showToast(`Backup imported: ${parts.join(", ")}`);
      if (result.failed.length) {
        setFormError(
          `These weren't imported: ${result.failed.map((f) => `${f.number} (${f.reason})`).join("; ")}`,
        );
      }
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    save(false);
  }

  // ---- Render ----
  const companyField = (field: CompanyField) => ({
    id: `company-${field}`,
    value: companyInput[field],
    disabled: !canEditCompany,
    "aria-invalid": Boolean(companyErrors[field]),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setCompanyInput((current) => ({ ...current, [field]: e.target.value }));
      if (companyErrors[field]) setCompanyErrors((current) => ({ ...current, [field]: undefined }));
    },
    className: `${inputBase} ${companyErrors[field] ? inputBad : inputOk}`,
  });

  const busy = saving || companyBusy || listBusy;

  return (
    <form onSubmit={handleSubmit} noValidate className="pb-[120px]">
      <div className="grid grid-cols-1 gap-6 min-[1100px]:grid-cols-[minmax(0,440px)_minmax(0,1fr)] min-[1100px]:items-start min-[1100px]:gap-7">
        {/* ------------------------------ Form ------------------------------ */}
        <div className="min-w-0">
          {formError && (
            <div role="alert" className="mb-[13px] rounded-[10px] border border-req/30 bg-[#fbecea] px-4 py-3 text-sm text-req">
              {formError}
            </div>
          )}

          {/* 1. Company */}
          <Card step={1} title="Company details" sub={companyDirty ? "· unsaved changes" : "· saved"}>
            <p className="mb-3.5 text-[11.5px] leading-normal text-muted">
              {canEditCompany
                ? "Set once and saved for everyone. Printed on every proforma invoice."
                : "Printed on every proforma invoice. Only administrators can change these."}
            </p>
            <Field label="Company name" htmlFor="company-name" error={companyErrors.name}>
              <input {...companyField("name")} />
            </Field>
            <Field label="Address" htmlFor="company-address" error={companyErrors.address}>
              <textarea rows={2} {...companyField("address")} className={`${companyField("address").className} min-h-[60px] resize-y leading-[1.45]`} />
            </Field>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Mobile" htmlFor="company-mobile" error={companyErrors.mobile}>
                <input type="tel" {...companyField("mobile")} />
              </Field>
              <Field label="Email" htmlFor="company-email" error={companyErrors.email}>
                <input type="email" {...companyField("email")} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="GSTIN" htmlFor="company-gstin" error={companyErrors.gstin}>
                <input maxLength={15} {...companyField("gstin")} className={`${companyField("gstin").className} uppercase`} />
              </Field>
              <Field label="State" htmlFor="company-stateCode" error={companyErrors.stateCode}>
                <select {...companyField("stateCode")} className={`${companyField("stateCode").className} ${selectArrow}`}>
                  <StateOptions />
                </select>
              </Field>
            </div>

            <fieldset className="mb-3.5 rounded-lg border border-line bg-soft p-[13px]">
              <legend className="float-left mb-2.5 w-full text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
                Bank details
              </legend>
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Bank" htmlFor="company-bankName" error={companyErrors.bankName}>
                  <input {...companyField("bankName")} />
                </Field>
                <Field label="A/c No." htmlFor="company-accountNumber" error={companyErrors.accountNumber}>
                  <input inputMode="numeric" {...companyField("accountNumber")} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="IFSC Code" htmlFor="company-ifsc" error={companyErrors.ifsc} compact>
                  <input maxLength={11} {...companyField("ifsc")} className={`${companyField("ifsc").className} uppercase`} />
                </Field>
                <Field label="Branch" htmlFor="company-bankBranch" error={companyErrors.bankBranch} compact>
                  <input {...companyField("bankBranch")} />
                </Field>
              </div>
            </fieldset>

            <div className="grid grid-cols-2 gap-2.5">
              <Field
                label="Logo"
                htmlFor="company-logo"
                hint={savedCompany.logoPath ? "Logo saved." : "Using the standard Sascan logo."}
              >
                <input
                  id="company-logo"
                  type="file"
                  accept={IMAGE_TYPES.join(",")}
                  disabled={!canEditCompany || companyBusy}
                  onChange={(e) => {
                    changeImage("logo", e.target.files?.[0]);
                    e.target.value = "";
                  }}
                  className={`${inputBase} ${inputOk} px-[7px] py-[7px] text-[13px]`}
                />
              </Field>
              <Field
                label="Signature"
                htmlFor="company-signature"
                hint={savedCompany.signaturePath ? "Signature saved." : "None — space is left to sign."}
              >
                <input
                  id="company-signature"
                  type="file"
                  accept={IMAGE_TYPES.join(",")}
                  disabled={!canEditCompany || companyBusy}
                  onChange={(e) => {
                    changeImage("signature", e.target.files?.[0]);
                    e.target.value = "";
                  }}
                  className={`${inputBase} ${inputOk} px-[7px] py-[7px] text-[13px]`}
                />
              </Field>
            </div>

            {canEditCompany && (
              <div className="flex flex-wrap gap-[9px]">
                <button type="button" onClick={saveCompany} disabled={companyBusy} className={primarySmall}>
                  {companyBusy ? "Saving…" : "Save company details"}
                </button>
                {companyDirty && (
                  <button
                    type="button"
                    onClick={() => {
                      setCompanyInput(savedCompanyInput);
                      setCompanyErrors({});
                    }}
                    disabled={companyBusy}
                    className={ghostButton}
                  >
                    Discard changes
                  </button>
                )}
                {savedCompany.logoPath && (
                  <button type="button" onClick={() => removeImage("logo")} disabled={companyBusy} className={ghostButton}>
                    Remove logo
                  </button>
                )}
                {savedCompany.signaturePath && (
                  <button type="button" onClick={() => removeImage("signature")} disabled={companyBusy} className={ghostButton}>
                    Remove signature
                  </button>
                )}
              </div>
            )}
          </Card>

          {/* 2. Quotation + customer */}
          <Card step={2} title={`${DOCUMENT_TITLE} & customer`} defaultOpen>
            {q.editingId && (
              <p className="mb-3 rounded-lg border border-[#c7dec5] bg-brand-soft px-3 py-2 text-[12.5px] text-brand-ink">
                Editing a saved {DOCUMENT_TITLE.toLowerCase()}. Save overwrites it, including its company details, with
                what&apos;s shown here; use <b>New</b> to start another.
              </p>
            )}
            <div className="grid grid-cols-[1.1fr_1fr_0.8fr] gap-2.5">
              <Field label="Prefix" htmlFor="numberPrefix" error={fieldErrors.numberPrefix}>
                <input
                  id="numberPrefix"
                  value={q.numberPrefix}
                  onChange={(e) => {
                    set({ numberPrefix: e.target.value });
                    clearError("numberPrefix");
                  }}
                  className={`${inputBase} ${fieldErrors.numberPrefix ? inputBad : inputOk}`}
                />
              </Field>
              <Field label="Fin. year" htmlFor="financialYear" error={fieldErrors.financialYear}>
                <input
                  id="financialYear"
                  value={q.financialYear}
                  onChange={(e) => {
                    set({ financialYear: e.target.value });
                    clearError("financialYear");
                  }}
                  className={`${inputBase} ${fieldErrors.financialYear ? inputBad : inputOk}`}
                />
              </Field>
              <Field label="No." htmlFor="sequenceNo" error={fieldErrors.sequenceNo ? " " : undefined}>
                <input
                  id="sequenceNo"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={q.sequenceNo}
                  onChange={(e) => {
                    set({ sequenceNo: e.target.value });
                    clearError("sequenceNo");
                  }}
                  className={`${inputBase} tabular-nums ${fieldErrors.sequenceNo ? inputBad : inputOk}`}
                />
              </Field>
            </div>
            {fieldErrors.sequenceNo && <p className="-mt-1.5 mb-2 text-[11.5px] text-req">{fieldErrors.sequenceNo}</p>}
            <Field label="Date" htmlFor="quotationDate" error={fieldErrors.quotationDate}>
              <input
                id="quotationDate"
                type="date"
                value={q.quotationDate}
                onChange={(e) => changeDate(e.target.value)}
                className={`${inputBase} ${fieldErrors.quotationDate ? inputBad : inputOk}`}
              />
            </Field>
            <p className="-mt-1.5 mb-3.5 text-[11.5px] leading-normal text-muted">
              Prints as <span className="font-semibold text-ink">{displayNumber}</span>
              {q.quotationDate && <> · {formatQuotationDate(q.quotationDate)}</>}
            </p>

            <Field
              label="Customer name"
              required
              htmlFor="customerName"
              error={fieldErrors.customerName}
              hint={customerHint}
            >
              <SuggestInput
                id="customerName"
                value={q.customerName}
                suggestions={matchCustomers(customers, q.customerName)}
                label="Saved customers"
                isExact={(c) => c.name.toLowerCase() === typedName}
                className={`${inputBase} ${fieldErrors.customerName ? inputBad : inputOk}`}
                onChange={(customerName) => {
                  // Retyping the name unlinks the picked customer.
                  set({ customerName, customerId: null });
                  clearError("customerName");
                }}
                onPick={pickCustomer}
                renderSuggestion={(c) => (
                  <>
                    <span className="block truncate text-[14px] font-semibold text-ink">{c.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {c.state_code} — {c.state} · {c.gstin ?? "URP"}
                    </span>
                  </>
                )}
              />
            </Field>
            {nameMatch && (
              <button
                type="button"
                onClick={() => pickCustomer(nameMatch)}
                className="-mt-1.5 mb-3 text-[12px] font-semibold text-brand hover:text-brand-ink"
              >
                Use the saved address, GSTIN and state for {nameMatch.name}
              </button>
            )}
            <Field label="Address" htmlFor="customerAddress" error={fieldErrors.customerAddress}>
              <textarea
                id="customerAddress"
                rows={3}
                value={q.customerAddress}
                onChange={(e) => set({ customerAddress: e.target.value })}
                className={`${inputBase} ${inputOk} min-h-[60px] resize-y leading-[1.45]`}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2.5">
              <Field
                label="Customer GSTIN"
                htmlFor="customerGstin"
                error={fieldErrors.customerGstin}
                hint={
                  gstinStateMismatch
                    ? `This GSTIN is for state code ${normalisedGstin.slice(0, 2)}, not ${state?.code}.`
                    : undefined
                }
                hintTone="warning"
              >
                <input
                  id="customerGstin"
                  value={q.customerGstin}
                  onChange={(e) => {
                    set({ customerGstin: e.target.value.toUpperCase() });
                    clearError("customerGstin");
                  }}
                  placeholder="URP if unregistered"
                  maxLength={15}
                  className={`${inputBase} uppercase placeholder:normal-case ${fieldErrors.customerGstin ? inputBad : inputOk}`}
                />
              </Field>
              <Field label="State" required htmlFor="customerStateCode" error={fieldErrors.customerStateCode}>
                <select
                  id="customerStateCode"
                  value={q.customerStateCode}
                  onChange={(e) => {
                    set({ customerStateCode: e.target.value });
                    clearError("customerStateCode");
                  }}
                  className={`${inputBase} ${selectArrow} ${fieldErrors.customerStateCode ? inputBad : inputOk}`}
                >
                  <option value="">Select state…</option>
                  <StateOptions />
                </select>
              </Field>
            </div>
            <p className="text-[11.5px] leading-normal text-muted">
              {taxMode === "intra"
                ? "Same state as your company → CGST + SGST"
                : taxMode === "inter"
                  ? "Different state → IGST"
                  : "Select the customer's state to apply GST."}
            </p>
          </Card>

          {/* 3. Items */}
          <Card step={3} title="Items" required defaultOpen>
            {fieldErrors.items && <p className="mb-2.5 text-xs text-req">{fieldErrors.items}</p>}

            {q.items.map((item, index) => {
              const err = (field: string) => fieldErrors[`items.${index}.${field}`];
              const id = (field: string) => `${item.id}-${field}`;
              const amounts = lineAmounts[index];
              const rates = GST_RATES.includes(item.gstRate) ? GST_RATES : [...GST_RATES, item.gstRate];
              return (
                <div key={item.id} className="mb-2.5 rounded-lg border border-line bg-soft p-3">
                  <div className="mb-[9px] flex items-center gap-2">
                    <span className="flex-none text-xs font-bold text-brand-ink">{index + 1}.</span>
                    <label htmlFor={id("itemName")} className="sr-only">
                      Item {index + 1} name
                    </label>
                    <SuggestInput
                      id={id("itemName")}
                      value={item.itemName}
                      suggestions={matchProducts(products, item.itemName)}
                      label="Saved products"
                      isExact={(p) => p.name.toLowerCase() === item.itemName.trim().toLowerCase()}
                      placeholder="Product name (bold) — type to pick a saved one"
                      className={`${inputBase} ${err("itemName") ? inputBad : inputOk}`}
                      onChange={(value) => updateItem(item.id, index, "itemName", value)}
                      onPick={(product) => pickProduct(item.id, index, product)}
                      renderSuggestion={(p) => (
                        <>
                          <span className="block truncate text-[14px] text-ink">
                            <b>{p.name}</b>
                            {p.short_description && <span className="text-muted"> - {p.short_description}</span>}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            ₹{formatRupees(toHundredths(p.rate))} · GST {Number(p.gst_rate)}% · HSN {p.hsn_code ?? "—"}
                          </span>
                        </>
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      title="Remove"
                      aria-label={`Remove item ${index + 1}`}
                      className="h-[38px] w-9 flex-none rounded-[7px] border border-line bg-paper text-base text-muted hover:border-req hover:text-req"
                    >
                      ×
                    </button>
                  </div>
                  {err("itemName") && <p className="-mt-1.5 mb-2 text-xs text-req">{err("itemName")}</p>}

                  <div className="mb-3">
                    <label htmlFor={id("shortDescription")} className="sr-only">
                      Item {index + 1} short description
                    </label>
                    <input
                      id={id("shortDescription")}
                      value={item.shortDescription}
                      onChange={(e) => updateItem(item.id, index, "shortDescription", e.target.value)}
                      placeholder="Short description, e.g. Hand-held Imaging System"
                      className={`${inputBase} ${inputOk}`}
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor={id("description")} className="sr-only">
                      Item {index + 1} included items
                    </label>
                    <textarea
                      id={id("description")}
                      rows={4}
                      value={item.description}
                      onChange={(e) => updateItem(item.id, index, "description", e.target.value)}
                      placeholder="Included items, one per line"
                      className={`${inputBase} ${inputOk} min-h-[60px] resize-y leading-[1.45]`}
                    />
                  </div>

                  <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,1.3fr)_minmax(0,0.9fr)] items-end gap-2">
                    <Field label="HSN" htmlFor={id("hsnCode")} error={err("hsnCode")} compact>
                      <input
                        id={id("hsnCode")}
                        value={item.hsnCode}
                        inputMode="numeric"
                        onChange={(e) => updateItem(item.id, index, "hsnCode", e.target.value)}
                        className={`${inputBase} ${err("hsnCode") ? inputBad : inputOk}`}
                      />
                    </Field>
                    <Field label="Qty" htmlFor={id("quantity")} error={err("quantity")} compact>
                      <input
                        id={id("quantity")}
                        value={item.quantity}
                        inputMode="decimal"
                        onChange={(e) => updateItem(item.id, index, "quantity", e.target.value)}
                        className={`${inputBase} tabular-nums ${err("quantity") ? inputBad : inputOk}`}
                      />
                    </Field>
                    <Field label="Rate (₹)" htmlFor={id("rate")} error={err("rate")} compact>
                      <input
                        id={id("rate")}
                        value={item.rate}
                        inputMode="decimal"
                        onChange={(e) => updateItem(item.id, index, "rate", e.target.value)}
                        className={`${inputBase} tabular-nums ${err("rate") ? inputBad : inputOk}`}
                      />
                    </Field>
                    <Field label="GST %" htmlFor={id("gstRate")} error={err("gstRate")} compact>
                      <select
                        id={id("gstRate")}
                        value={item.gstRate}
                        onChange={(e) => updateItem(item.id, index, "gstRate", e.target.value)}
                        className={`${inputBase} ${selectArrow} ${err("gstRate") ? inputBad : inputOk}`}
                      >
                        {rates.map((rate) => (
                          <option key={rate} value={rate}>
                            {rate}%
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <ProductStatus item={item} products={products} busy={productBusy} onSave={() => saveAsProduct(item)} />
                    {amounts.taxable > ZERO && (
                      <p className="ml-auto text-right text-[13px] font-bold text-brand-ink tabular-nums">
                        Taxable ₹{formatRupees(amounts.taxable)} · Total ₹{formatRupees(amounts.total)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}

            <button type="button" onClick={addItem} className={`${ghostButton} w-full`}>
              + Add another item
            </button>

            <div className="mt-3.5 flex items-baseline justify-between gap-3.5 border-t border-line pt-[13px] text-[12.5px] font-semibold uppercase tracking-[0.05em] text-muted">
              <span>{DOCUMENT_TITLE} total</span>
              <b className="text-[19px] font-bold normal-case tracking-[-0.025em] text-ink tabular-nums">
                {totals.total > ZERO ? `₹ ${formatRupees(totals.total)}` : "—"}
              </b>
            </div>
          </Card>

          {/* 4. Terms */}
          <Card step={4} title="Terms & conditions">
            <Field label="Payment terms" htmlFor="paymentTerms">
              <input
                id="paymentTerms"
                value={q.terms.paymentTerms}
                onChange={(e) => set({ terms: { ...q.terms, paymentTerms: e.target.value } })}
                className={`${inputBase} ${inputOk}`}
              />
            </Field>
            <Field label="Extended warranty" htmlFor="extendedWarranty">
              <input
                id="extendedWarranty"
                value={q.terms.extendedWarranty}
                onChange={(e) => set({ terms: { ...q.terms, extendedWarranty: e.target.value } })}
                className={`${inputBase} ${inputOk}`}
              />
            </Field>
            <Field
              label="Delivery, installation & training"
              htmlFor="deliveryTerms"
              hint="Each line prints on its own line, in bold."
            >
              <textarea
                id="deliveryTerms"
                rows={4}
                value={q.terms.deliveryTerms}
                onChange={(e) => set({ terms: { ...q.terms, deliveryTerms: e.target.value } })}
                className={`${inputBase} ${inputOk} min-h-[60px] resize-y leading-[1.45]`}
              />
            </Field>
            <Field label={`${DOCUMENT_TITLE} validity`} htmlFor="validity" last>
              <input
                id="validity"
                value={q.terms.validity}
                onChange={(e) => set({ terms: { ...q.terms, validity: e.target.value } })}
                className={`${inputBase} ${inputOk}`}
              />
            </Field>
          </Card>

          {/* 5. Saved */}
          <Card step={5} title={`Saved ${DOCUMENT_TITLE.toLowerCase()}s`} sub={savedCount ? `· ${savedCount}` : undefined}>
            <ul className="mb-3">
              {recent.length === 0 ? (
                <li className="pt-1.5 pb-3 text-[13px] text-muted">Nothing saved yet. Use Save or Download PDF.</li>
              ) : (
                recent.map((row) => (
                  <li key={row.id} className="flex items-center gap-2 border-b border-line py-[9px] text-[13px]">
                    <div className="min-w-0 flex-1 leading-[1.4]">
                      <b className="block text-[13px]">
                        {row.invoice_number}
                        {row.id === q.editingId && <span className="ml-1.5 font-semibold text-brand">· open</span>}
                        <span className="ml-1.5 align-middle">
                          <StatusPill status={row.status} />
                        </span>
                      </b>
                      <span className="block truncate text-xs text-muted">
                        {row.customer_name || "—"} · {formatQuotationDate(row.invoice_date)} · ₹
                        {formatRupees(toHundredths(row.total_amount))}
                      </span>
                    </div>
                    <button type="button" onClick={() => open(row.id)} disabled={busy} className={ghostButton}>
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(row)}
                      disabled={busy}
                      title="Delete"
                      aria-label={`Delete ${row.invoice_number}`}
                      className="h-[38px] w-9 flex-none rounded-[7px] border border-line bg-paper text-base text-muted hover:border-req hover:text-req disabled:opacity-50"
                    >
                      ×
                    </button>
                  </li>
                ))
              )}
            </ul>
            {savedCount > recent.length && (
              <Link href="/dashboard/quotations" className="mb-3 block text-[13px] font-semibold text-brand hover:text-brand-ink">
                View all {savedCount} →
              </Link>
            )}
            <div className="flex flex-wrap gap-[9px]">
              <button type="button" onClick={downloadBackup} disabled={busy} className={ghostButton}>
                Export backup
              </button>
              <button type="button" onClick={() => importInput.current?.click()} disabled={busy} className={ghostButton}>
                Import backup
              </button>
              <input
                ref={importInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  void restoreBackup(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
            <p className="mt-[5px] text-[11.5px] leading-normal text-muted">
              Saved {DOCUMENT_TITLE.toLowerCase()}s are stored in the database and shared with the team. Import also
              accepts backups from the old standalone quotation page.
            </p>
          </Card>
        </div>

        {/* ----------------------------- Preview ----------------------------- */}
        <div className="min-w-0 min-[1100px]:sticky min-[1100px]:top-4">
          <div className="mb-[11px] flex items-center justify-between gap-2.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted">Preview (A4)</span>
            {taxMode && (
              <span className="rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand-ink">
                {taxMode === "intra" ? "CGST + SGST" : "IGST"}
              </span>
            )}
          </div>
          <ScaledPaper>
            <QuotationPaper quotation={previewRow} company={previewCompany} />
          </ScaledPaper>
        </div>
      </div>

      {/* ---------------------------- Bottom bar ---------------------------- */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/95 px-[18px] pt-[11px] pb-[calc(11px+env(safe-area-inset-bottom))] backdrop-blur-md">
        <div className="mx-auto flex max-w-[1360px] items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted">{displayNumber}</div>
            <div className="truncate text-sm font-semibold">
              {q.customerName.trim() || "No customer yet"}
              {totals.total > ZERO && ` · ₹${formatRupees(totals.total)}`}
            </div>
          </div>
          <button type="button" onClick={newQuotation} disabled={busy} className={`${ghostButton} px-4 py-[11px] text-sm max-[560px]:px-[11px] max-[560px]:py-2.5`}>
            New
          </button>
          <button type="submit" disabled={busy} className={`${ghostButton} px-4 py-[11px] text-sm max-[560px]:px-[11px] max-[560px]:py-2.5`}>
            {saving && busyAction === "save" ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => save(true)}
            disabled={busy}
            className="flex items-center gap-2 rounded-lg border border-brand bg-brand px-4 py-[11px] text-sm font-semibold text-white hover:bg-brand-ink disabled:cursor-not-allowed disabled:opacity-70 max-[560px]:px-[11px] max-[560px]:py-2.5 max-[560px]:text-[13px]"
          >
            {saving && busyAction === "pdf" && (
              <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            {saving && busyAction === "pdf" ? "Preparing…" : "Download PDF"}
          </button>
        </div>
      </div>

      {/* ------------------------------ Toast ------------------------------ */}
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed bottom-[90px] left-1/2 z-[70] max-w-[90vw] -translate-x-1/2 rounded-full bg-ink px-[18px] py-[11px] text-center text-[13.5px] font-medium text-white transition-opacity duration-200 ${toast ? "opacity-100" : "opacity-0"}`}
      >
        {toast}
      </div>
    </form>
  );
}

/** Under each item: whether it's a saved product, with a button to save or update it. */
function ProductStatus({
  item,
  products,
  busy,
  onSave,
}: {
  item: ItemState;
  products: ProductRow[];
  busy: boolean;
  onSave: () => void;
}) {
  const name = item.itemName.trim().toLowerCase();
  if (!name || !item.rate.trim()) return null;
  const saved = products.find((p) => p.name.toLowerCase() === name);
  if (saved && itemMatchesProduct({ ...item, name: item.itemName }, saved)) {
    return <span className="text-xs font-semibold text-muted">✓ Saved product</span>;
  }
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={busy}
      title={saved ? "Replace the saved product's details with these" : "Add to the product list"}
      className="text-xs font-semibold text-brand hover:text-brand-ink disabled:opacity-50"
    >
      {busy ? "Saving…" : saved ? "Update saved product" : "+ Save to products"}
    </button>
  );
}

function StateOptions() {
  return (
    <>
      {INDIAN_STATES.map((s) => (
        <option key={s.code} value={s.code}>
          {s.code} — {s.name}
        </option>
      ))}
    </>
  );
}

/** A4 sheet scaled down to fit the available width, like a print preview. */
function ScaledPaper({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, entry.contentRect.width / PAPER_WIDTH));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="overflow-hidden">
      <div
        style={{ width: PAPER_WIDTH, zoom: scale }}
        className="border border-line bg-white px-[22px] pt-[26px] pb-[30px] shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
      >
        {children}
      </div>
    </div>
  );
}

function Card({
  step,
  title,
  sub,
  required,
  defaultOpen,
  children,
}: {
  step: number;
  title: string;
  sub?: string;
  required?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group mb-[13px] overflow-hidden rounded-[10px] border border-line bg-paper">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2.5 px-4 py-[15px] text-[14.5px] font-semibold tracking-[-0.01em] group-open:border-b group-open:border-line [&::-webkit-details-marker]:hidden">
        <span>
          <span className="mr-[9px] inline-flex size-[21px] items-center justify-center rounded-md bg-brand-soft text-[11.5px] font-bold text-brand-ink">
            {step}
          </span>
          {title}
          {required && <span className="ml-0.5 text-req">*</span>}
          {sub && <span className="ml-1 text-xs font-medium text-muted">{sub}</span>}
        </span>
        <span aria-hidden className="text-xs text-muted transition-transform duration-200 group-open:rotate-90">
          ▸
        </span>
      </summary>
      <div className="p-4">{children}</div>
    </details>
  );
}

function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  hintTone = "muted",
  compact,
  last,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  hint?: string;
  hintTone?: "muted" | "warning";
  compact?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  const showError = error && error.trim();
  return (
    <div className={`min-w-0 ${compact || last ? "" : "mb-3"}`}>
      <label
        htmlFor={htmlFor}
        className="mb-[5px] block text-[11px] font-semibold uppercase tracking-[0.09em] text-muted"
      >
        {label}
        {required && <span className="ml-0.5 text-req">*</span>}
      </label>
      {children}
      {showError ? (
        <p className="mt-[5px] text-[11.5px] leading-normal text-req">{error}</p>
      ) : (
        hint && (
          <p className={`mt-[5px] text-[11.5px] leading-normal ${hintTone === "warning" ? "text-amber-700" : "text-muted"}`}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}
