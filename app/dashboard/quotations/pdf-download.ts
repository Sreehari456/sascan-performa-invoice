/** Fetches a saved quotation's PDF and saves it as `filename`. Throws a readable Error on failure. */
export async function downloadQuotationPdf(id: string, filename: string): Promise<void> {
  const response = await fetch(`/dashboard/quotations/${id}/pdf`, { cache: "no-store" });
  const type = response.headers.get("Content-Type") ?? "";

  if (!response.ok || !type.includes("application/pdf")) {
    // A signed-out user is redirected to the login page (HTML) by the proxy.
    const body = type.includes("application/json") ? await response.json().catch(() => null) : null;
    throw new Error(
      body?.error ??
        (type.includes("text/html")
          ? "Your session has expired. Refresh the page and sign in again."
          : "The PDF couldn't be generated."),
    );
  }

  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
