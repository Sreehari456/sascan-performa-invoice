"use client";

import { useRef, useState, useTransition } from "react";
import { deleteQuotation } from "./actions";

export function DeleteQuotationButton({
  id,
  quotationNumber,
  canDelete,
}: {
  id: string;
  quotationNumber: string;
  canDelete: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, startDeleting] = useTransition();

  function open() {
    setError(null);
    dialogRef.current?.showModal();
  }

  function confirm() {
    startDeleting(async () => {
      // On success the action redirects to the quotation list.
      const result = await deleteQuotation(id);
      if (result) setError(result.error);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={!canDelete}
        title={canDelete ? undefined : "Only the person who created this performa invoice can delete it."}
        className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
      >
        Delete
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="delete-quotation-title"
        onCancel={(event) => {
          if (deleting) event.preventDefault();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-[10px] border border-line bg-white p-6 text-ink shadow-xl backdrop:bg-slate-900/40"
      >
        <h2 id="delete-quotation-title" className="text-lg font-semibold">
          Delete performa invoice?
        </h2>
        <p className="mt-2 text-sm text-muted">
          <span className="font-semibold text-ink">{quotationNumber}</span> and all of its
          line items will be permanently deleted. This can&apos;t be undone.
        </p>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            disabled={deleting}
            className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-soft disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={deleting}
            className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {deleting && (
              <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            {deleting ? "Deleting…" : "Delete performa invoice"}
          </button>
        </div>
      </dialog>
    </>
  );
}
