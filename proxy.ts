import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Only the pages that need a sign-in check. Everything else (static files,
  // images, the home page) never runs the proxy.
  matcher: ["/dashboard", "/dashboard/:path*", "/login"],
};
