import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Importing a quotation backup sends the whole file to a Server Action.
      bodySizeLimit: "4mb",
    },
  },
  // PDF generation reads these from disk at runtime, so make sure they're
  // bundled with the routes that make PDFs (the download route, and the
  // quotation page, whose "Email PDF" Server Action attaches one).
  outputFileTracingIncludes: {
    "/dashboard/quotations/[id]/pdf": ["./lib/quotation/pdf/fonts/*.ttf", "./public/sascan-logo.png"],
    "/dashboard/quotations/[id]": ["./lib/quotation/pdf/fonts/*.ttf", "./public/sascan-logo.png"],
  },
};

export default nextConfig;
