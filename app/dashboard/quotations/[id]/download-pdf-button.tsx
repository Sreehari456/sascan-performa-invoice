"use client";

import { useEffect, useRef, useState } from "react";
import { downloadQuotationPdf } from "../pdf-download";

export function DownloadPdfButton({
  id,
  filename,
  autoStart = false,
}: {
  id: string;
  filename: string;
  /** Start the download as soon as the page opens (after "Save & download PDF"). */
  autoStart?: boolean;
}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoStarted = useRef(false);

  useEffect(() => {
    if (!autoStart || autoStarted.current) return;
    autoStarted.current = true;
    // Drop ?download=1 so a refresh doesn't download again.
    window.history.replaceState(null, "", window.location.pathname);
    void download();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [autoStart]);

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      await downloadQuotationPdf(id, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The PDF couldn't be downloaded.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={download}
        disabled={downloading}
        className="flex items-center gap-2 rounded-lg border border-brand bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-70"
      >
        {downloading && (
          <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        )}
        {downloading ? "Preparing PDF…" : "Download PDF"}
      </button>
      {error && (
        <p role="alert" className="max-w-xs text-right text-xs text-req">
          {error}
        </p>
      )}
    </div>
  );
}
