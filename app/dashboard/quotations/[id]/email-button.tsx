"use client";

import { useId, useRef, useState, useTransition } from "react";
import { sendQuotationEmail, type EmailResult } from "./actions";

const inputBase =
  "block w-full appearance-none rounded-[7px] border bg-paper px-2.5 py-[9px] text-[15px] text-ink focus:outline-none focus:ring-[3px]";
const inputOk = "border-line focus:border-brand focus:ring-brand-soft";
const inputBad = "border-req ring-[3px] ring-[#fbecea] focus:border-req focus:ring-[#fbecea]";
const label = "mb-[5px] block text-[11px] font-semibold uppercase tracking-[0.09em] text-muted";

export function EmailButton({
  id,
  configured,
  defaultTo,
  defaultSubject,
  defaultMessage,
  attachmentName,
  canRememberEmail,
}: {
  id: string;
  /** Whether RESEND_API_KEY and EMAIL_FROM are set on the server. */
  configured: boolean;
  defaultTo: string;
  defaultSubject: string;
  defaultMessage: string;
  attachmentName: string;
  /** The quotation is linked to a saved customer, so the address can be remembered. */
  canRememberEmail: boolean;
}) {
  const formId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  const [sendMeCopy, setSendMeCopy] = useState(true);
  const [saveToCustomer, setSaveToCustomer] = useState(true);
  const [result, setResult] = useState<EmailResult | null>(null);
  const [sending, startSending] = useTransition();

  function open() {
    setTo(defaultTo);
    setCc("");
    setSubject(defaultSubject);
    setMessage(defaultMessage);
    setResult(null);
    dialogRef.current?.showModal();
  }

  function send() {
    startSending(async () => {
      setResult(await sendQuotationEmail(id, { to, cc, subject, message, sendMeCopy, saveToCustomer }));
    });
  }

  const errorField = result && !result.ok ? result.field : undefined;
  const sent = result?.ok === true;
  const rememberable = canRememberEmail && to.trim().toLowerCase() !== defaultTo.toLowerCase();

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="rounded-lg border border-line bg-transparent px-4 py-2 text-sm font-semibold text-ink hover:border-ink hover:bg-soft"
      >
        Email PDF
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={`${formId}-title`}
        onCancel={(event) => {
          if (sending) event.preventDefault();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-[10px] border border-line bg-white p-6 text-ink shadow-xl backdrop:bg-slate-900/40"
      >
        <h2 id={`${formId}-title`} className="text-lg font-semibold">
          Email proforma invoice
        </h2>

        {!configured ? (
          <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
            <p>Email isn&apos;t set up yet. An administrator needs to add these to the server&apos;s environment:</p>
            <ul className="list-disc pl-5">
              <li>
                <code className="rounded bg-soft px-1 text-ink">RESEND_API_KEY</code> — from resend.com
              </li>
              <li>
                <code className="rounded bg-soft px-1 text-ink">EMAIL_FROM</code> — e.g. Sascan Meditech
                &lt;quotations@sascan.in&gt;, on a domain verified in Resend
              </li>
            </ul>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink hover:bg-soft"
              >
                Close
              </button>
            </div>
          </div>
        ) : sent ? (
          <div className="mt-3 space-y-4">
            <p role="status" className="rounded-lg border border-[#c7dec5] bg-brand-soft px-3 py-2 text-sm text-brand-ink">
              Sent to {to}. Replies go to the company email on the proforma invoice.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-ink"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            noValidate
            className="mt-4 space-y-3"
          >
            {result && !result.ok && (
              <p role="alert" className="rounded-lg border border-req/30 bg-[#fbecea] px-3 py-2 text-sm text-req">
                {result.error}
              </p>
            )}
            <div>
              <label htmlFor={`${formId}-to`} className={label}>
                To
              </label>
              <input
                id={`${formId}-to`}
                type="email"
                multiple
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="customer@example.com"
                className={`${inputBase} ${errorField === "to" ? inputBad : inputOk}`}
              />
              {rememberable && (
                <label className="mt-1.5 flex items-center gap-2 text-[13px] text-muted">
                  <input type="checkbox" checked={saveToCustomer} onChange={(e) => setSaveToCustomer(e.target.checked)} />
                  Save this address to the customer
                </label>
              )}
            </div>
            <div>
              <label htmlFor={`${formId}-cc`} className={label}>
                CC <span className="normal-case tracking-normal">(optional)</span>
              </label>
              <input
                id={`${formId}-cc`}
                type="email"
                multiple
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                className={`${inputBase} ${errorField === "cc" ? inputBad : inputOk}`}
              />
            </div>
            <div>
              <label htmlFor={`${formId}-subject`} className={label}>
                Subject
              </label>
              <input
                id={`${formId}-subject`}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className={`${inputBase} ${errorField === "subject" ? inputBad : inputOk}`}
              />
            </div>
            <div>
              <label htmlFor={`${formId}-message`} className={label}>
                Message
              </label>
              <textarea
                id={`${formId}-message`}
                rows={8}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className={`${inputBase} resize-y leading-[1.45] ${errorField === "message" ? inputBad : inputOk}`}
              />
            </div>
            <p className="text-[13px] text-muted">
              Attached: <span className="font-medium text-ink">{attachmentName}</span>
            </p>
            <label className="flex items-center gap-2 text-[13px] text-muted">
              <input type="checkbox" checked={sendMeCopy} onChange={(e) => setSendMeCopy(e.target.checked)} />
              Send me a copy
            </label>
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                disabled={sending}
                className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-soft disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sending}
                className="flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-ink disabled:opacity-70"
              >
                {sending && (
                  <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                )}
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
