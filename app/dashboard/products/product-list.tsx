"use client";

import { useId, useState, useTransition } from "react";
import { productToInput, type ProductFieldErrors, type ProductInput, type ProductRow } from "@/lib/products";
import { DEFAULT_GST_RATE, GST_RATES } from "@/lib/quotation/defaults";
import { formatRupees } from "@/lib/quotation/format";
import { toHundredths } from "@/lib/quotation/queries";
import { createProduct, deleteProduct, updateProduct } from "./actions";

const inputBase =
  "block w-full appearance-none rounded-[7px] border bg-paper px-2.5 py-[9px] text-[15px] text-ink placeholder:text-muted/60 focus:outline-none focus:ring-[3px]";
const inputOk = "border-line focus:border-brand focus:ring-brand-soft";
const inputBad = "border-req ring-[3px] ring-[#fbecea] focus:border-req focus:ring-[#fbecea]";
const ghostButton =
  "rounded-lg border border-line bg-transparent px-[13px] py-2 text-[13px] font-semibold text-ink hover:border-ink hover:bg-soft disabled:opacity-50";
const primaryButton =
  "rounded-lg border border-brand bg-brand px-[13px] py-2 text-[13px] font-semibold text-white hover:bg-brand-ink disabled:opacity-60";

const EMPTY: ProductInput = { name: "", shortDescription: "", description: "", hsnCode: "", rate: "", gstRate: DEFAULT_GST_RATE };

export function ProductList({ products, searching }: { products: ProductRow[]; searching: boolean }) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      {adding ? (
        <div className="rounded-[10px] border border-line bg-soft p-4">
          <h2 className="mb-3 text-[15px] font-bold">New product</h2>
          <ProductForm
            initial={EMPTY}
            submitLabel="Add product"
            onSubmit={createProduct}
            onDone={() => setAdding(false)}
          />
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={primaryButton}>
          + Add product
        </button>
      )}

      {products.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-line bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-ink">{searching ? "No products match your search." : "No products yet."}</p>
          <p className="mt-1 text-sm text-muted">
            {searching
              ? "Try a different name or HSN code."
              : "Add one here, or use “Save to products” on an item in a proforma invoice."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-[10px] border border-line bg-white">
          {products.map((product) => (
            <ProductItem key={product.id} product={product} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductItem({ product }: { product: ProductRow }) {
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, startWork] = useTransition();

  function remove() {
    if (!window.confirm(`Delete ${product.name} from your products? Proforma invoices that use it are not changed.`)) return;
    startWork(async () => {
      const result = await deleteProduct(product.id);
      if (!result.ok) setMessage(result.error);
    });
  }

  if (editing) {
    return (
      <li className="bg-soft px-4 py-4">
        <ProductForm
          initial={productToInput(product)}
          submitLabel="Save product"
          onSubmit={(input) => updateProduct(product.id, input)}
          onDone={() => setEditing(false)}
          note="Proforma invoices already saved keep the details they were saved with."
        />
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-3 px-4 py-3.5">
      <div className="min-w-0 flex-1 basis-72">
        <p className="text-ink">
          <span className="font-semibold">{product.name}</span>
          {product.short_description && <span className="text-muted"> - {product.short_description}</span>}
        </p>
        {product.description && (
          <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-[13px] leading-snug text-muted">{product.description}</p>
        )}
        <p className="mt-1 text-xs text-muted">
          <span className="font-semibold text-ink">₹{formatRupees(toHundredths(product.rate))}</span> · GST{" "}
          {Number(product.gst_rate)}% · HSN {product.hsn_code ?? "—"}
        </p>
        {message && <p role="alert" className="mt-1 text-sm text-req">{message}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setEditing(true);
          }}
          disabled={busy}
          className={ghostButton}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="rounded-lg border border-red-200 bg-white px-[13px] py-2 text-[13px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {busy ? "…" : "Delete"}
        </button>
      </div>
    </li>
  );
}

function ProductForm({
  initial,
  submitLabel,
  onSubmit,
  onDone,
  note,
}: {
  initial: ProductInput;
  submitLabel: string;
  onSubmit: (input: ProductInput) => Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: ProductFieldErrors }>;
  onDone: () => void;
  note?: string;
}) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<ProductFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, startWork] = useTransition();
  const idPrefix = useId();
  const rates = GST_RATES.includes(values.gstRate) ? GST_RATES : [...GST_RATES, values.gstRate];

  const field = (key: keyof ProductInput) => ({
    id: `${idPrefix}-${key}`,
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setValues((current) => ({ ...current, [key]: e.target.value }));
      setErrors((current) => ({ ...current, [key]: undefined }));
    },
    "aria-invalid": Boolean(errors[key]),
    className: `${inputBase} ${errors[key] ? inputBad : inputOk}`,
  });

  function submit() {
    startWork(async () => {
      const result = await onSubmit(values);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.error);
        return;
      }
      onDone();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
      className="grid gap-3 sm:grid-cols-2"
    >
      <Labelled label="Product name" htmlFor={`${idPrefix}-name`} error={errors.name}>
        <input {...field("name")} placeholder="Prints in bold, e.g. OralScan" />
      </Labelled>
      <Labelled label="Short description" htmlFor={`${idPrefix}-shortDescription`} error={errors.shortDescription}>
        <input {...field("shortDescription")} placeholder="e.g. Hand-held Imaging System" />
      </Labelled>
      <div className="sm:col-span-2">
        <Labelled label="Included items" htmlFor={`${idPrefix}-description`} error={errors.description}>
          <textarea
            rows={5}
            {...field("description")}
            placeholder="One per line"
            className={`${field("description").className} resize-y leading-[1.45]`}
          />
        </Labelled>
      </div>
      <div className="grid grid-cols-3 gap-2.5 sm:col-span-2">
        <Labelled label="HSN" htmlFor={`${idPrefix}-hsnCode`} error={errors.hsnCode}>
          <input inputMode="numeric" {...field("hsnCode")} />
        </Labelled>
        <Labelled label="Rate (₹)" htmlFor={`${idPrefix}-rate`} error={errors.rate}>
          <input inputMode="decimal" {...field("rate")} className={`${field("rate").className} tabular-nums`} />
        </Labelled>
        <Labelled label="GST %" htmlFor={`${idPrefix}-gstRate`} error={errors.gstRate}>
          <select {...field("gstRate")}>
            {rates.map((rate) => (
              <option key={rate} value={rate}>
                {rate}%
              </option>
            ))}
          </select>
        </Labelled>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
        {message && <p role="alert" className="mr-auto text-sm text-req">{message}</p>}
        <button type="button" onClick={onDone} disabled={busy} className={ghostButton}>
          Cancel
        </button>
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
      {note && <p className="text-xs text-muted sm:col-span-2">{note}</p>}
    </form>
  );
}

function Labelled({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-[5px] block text-[11px] font-semibold uppercase tracking-[0.09em] text-muted">
        {label}
      </label>
      {children}
      {error && <p className="mt-[5px] text-[11.5px] text-req">{error}</p>}
    </div>
  );
}
