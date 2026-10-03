"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { CustomerFieldErrors, CustomerInput, CustomerListRow } from "@/lib/customers";
import { INDIAN_STATES } from "@/lib/quotation/states";
import { deleteCustomer, updateCustomer } from "./actions";

const inputBase =
  "block w-full appearance-none rounded-[7px] border bg-paper px-2.5 py-[9px] text-[15px] text-ink focus:outline-none focus:ring-[3px]";
const inputOk = "border-line focus:border-brand focus:ring-brand-soft";
const inputBad = "border-req ring-[3px] ring-[#fbecea] focus:border-req focus:ring-[#fbecea]";
const ghostButton =
  "rounded-lg border border-line bg-transparent px-[13px] py-2 text-[13px] font-semibold text-ink hover:border-ink hover:bg-soft disabled:opacity-50";

export function CustomerList({ customers }: { customers: CustomerListRow[] }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-[10px] border border-line bg-white">
      {customers.map((customer) => (
        <CustomerItem key={customer.id} customer={customer} />
      ))}
    </ul>
  );
}

function CustomerItem({ customer }: { customer: CustomerListRow }) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<CustomerInput>(() => toInput(customer));
  const [errors, setErrors] = useState<CustomerFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, startWork] = useTransition();

  function startEditing() {
    setValues(toInput(customer));
    setErrors({});
    setMessage(null);
    setEditing(true);
  }

  function save() {
    startWork(async () => {
      const result = await updateCustomer(customer.id, values);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setMessage(result.error);
        return;
      }
      setEditing(false);
      setMessage(null);
    });
  }

  function remove() {
    const invoices =
      customer.invoice_count > 0
        ? ` Their ${customer.invoice_count} proforma invoice${customer.invoice_count === 1 ? " is" : "s are"} kept.`
        : "";
    if (!window.confirm(`Delete ${customer.name} from your customers?${invoices}`)) return;
    startWork(async () => {
      const result = await deleteCustomer(customer.id);
      if (!result.ok) setMessage(result.error);
    });
  }

  const field = (key: keyof CustomerInput) => ({
    id: `${customer.id}-${key}`,
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setValues((current) => ({ ...current, [key]: e.target.value }));
      setErrors((current) => ({ ...current, [key]: undefined }));
    },
    "aria-invalid": Boolean(errors[key]),
    className: `${inputBase} ${errors[key] ? inputBad : inputOk}`,
  });

  if (editing) {
    return (
      <li className="bg-soft px-4 py-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          noValidate
          className="grid gap-3 sm:grid-cols-2"
        >
          <Labelled label="Name" htmlFor={`${customer.id}-name`} error={errors.name}>
            <input {...field("name")} />
          </Labelled>
          <Labelled label="GSTIN" htmlFor={`${customer.id}-gstin`} error={errors.gstin}>
            <input
              {...field("gstin")}
              maxLength={15}
              placeholder="URP if unregistered"
              className={`${field("gstin").className} uppercase placeholder:normal-case`}
            />
          </Labelled>
          <div className="sm:col-span-2">
            <Labelled label="Address" htmlFor={`${customer.id}-address`} error={errors.address}>
              <textarea rows={3} {...field("address")} className={`${field("address").className} resize-y leading-[1.45]`} />
            </Labelled>
          </div>
          <Labelled label="Email" htmlFor={`${customer.id}-email`} error={errors.email}>
            <input type="email" {...field("email")} placeholder="Used when emailing proforma invoices" />
          </Labelled>
          <Labelled label="State" htmlFor={`${customer.id}-stateCode`} error={errors.stateCode}>
            <select {...field("stateCode")}>
              <option value="">Select state…</option>
              {INDIAN_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} — {s.name}
                </option>
              ))}
            </select>
          </Labelled>
          <div className="flex flex-wrap items-end justify-end gap-2 sm:col-span-2">
            {message && <p role="alert" className="mr-auto self-center text-sm text-req">{message}</p>}
            <button type="button" onClick={() => setEditing(false)} disabled={busy} className={ghostButton}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg border border-brand bg-brand px-[13px] py-2 text-[13px] font-semibold text-white hover:bg-brand-ink disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save customer"}
            </button>
          </div>
          <p className="text-xs text-muted sm:col-span-2">
            Proforma invoices already saved keep the details they were saved with.
          </p>
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-3 px-4 py-3.5">
      <div className="min-w-0 flex-1 basis-64">
        <p className="font-semibold text-ink">{customer.name}</p>
        {customer.address && <p className="mt-0.5 whitespace-pre-line text-[13px] leading-snug text-muted">{customer.address}</p>}
        <p className="mt-1 text-xs text-muted">
          {customer.state_code} — {customer.state} · GSTIN {customer.gstin ?? "URP"} ·{" "}
          {customer.email && <>{customer.email} · </>}
          {customer.invoice_count} proforma invoice{customer.invoice_count === 1 ? "" : "s"}
        </p>
        {message && <p role="alert" className="mt-1 text-sm text-req">{message}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/dashboard/quotations/new?customer=${customer.id}`}
          className="rounded-lg border border-brand bg-brand px-[13px] py-2 text-[13px] font-semibold text-white hover:bg-brand-ink"
        >
          New proforma invoice
        </Link>
        <button type="button" onClick={startEditing} disabled={busy} className={ghostButton}>
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

function toInput(customer: CustomerListRow): CustomerInput {
  return {
    name: customer.name,
    address: customer.address,
    gstin: customer.gstin ?? "URP",
    stateCode: customer.state_code,
    email: customer.email ?? "",
  };
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
