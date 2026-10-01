import { createClient } from "@/lib/supabase/server";
import { renderQuotationPdf } from "@/lib/quotation/pdf/render";
import { getQuotation } from "@/lib/quotation/queries";

export const runtime = "nodejs";

/** Generates the saved quotation as a PDF download. Nothing is stored. */
export async function GET(_request: Request, ctx: RouteContext<"/dashboard/quotations/[id]/pdf">) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) {
    return Response.json({ error: "Your session has expired. Sign in again." }, { status: 401 });
  }

  let quotation;
  try {
    quotation = await getQuotation(supabase, id);
  } catch (error) {
    console.error("Failed to load quotation for PDF:", error);
    return Response.json({ error: "The performa invoice couldn't be loaded." }, { status: 500 });
  }
  if (!quotation) {
    return Response.json({ error: "Performa invoice not found." }, { status: 404 });
  }

  let rendered;
  try {
    rendered = await renderQuotationPdf(supabase, quotation);
  } catch (error) {
    console.error("Failed to render quotation PDF:", error);
    return Response.json({ error: "The PDF couldn't be generated." }, { status: 500 });
  }

  const { pdf, filename } = rendered;
  // Customer names can contain non-ASCII characters, which a plain header can't carry.
  const asciiFilename = filename.replace(/[^\x20-\x7e]+/g, "_").replace(/"/g, "");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": String(pdf.length),
      "Cache-Control": "private, no-store",
    },
  });
}
