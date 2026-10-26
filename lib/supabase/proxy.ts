import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes that require a signed-in user.
const PROTECTED_PREFIXES = ["/dashboard"];

// Some hosts (Netlify) run the proxy as an edge function with tight time
// limits, so the Supabase call here is bounded. If it's slow or fails, the
// request carries on: the dashboard layout checks sign-in again on the server,
// so this is a convenience (token refresh, early redirect), not the only guard.
const SUPABASE_TIMEOUT_MS = 4000;

/** Supabase keeps the session in cookies named sb-<project>-auth-token (possibly split into .0, .1, …). */
function hasAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some(({ name }) => name.startsWith("sb-") && name.includes("-auth-token"));
}

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const isLogin = pathname === "/login";

  // Nothing to do for other pages.
  if (!isProtected && !isLogin) return NextResponse.next({ request });

  // Signed out: decide without contacting Supabase.
  if (!hasAuthCookie(request)) {
    return isProtected ? redirectTo(request, NextResponse.next({ request }), "/login") : NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: {
        fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS) }),
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes the auth token if expired. Don't run code between
  // createServerClient and this call.
  let isSignedIn: boolean;
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error) {
      // Couldn't reach Supabase in time: let the page's own server-side check decide.
      if (error.name === "AuthRetryableFetchError" || /abort|timeout/i.test(error.message)) return response;
      isSignedIn = false;
    } else {
      isSignedIn = Boolean(data?.claims);
    }
  } catch (error) {
    console.error("Proxy session check failed:", error);
    return response;
  }

  if (!isSignedIn && isProtected) {
    return redirectTo(request, response, "/login");
  }

  if (isSignedIn && isLogin) {
    return redirectTo(request, response, "/dashboard");
  }

  return response;
}

// Redirect while keeping any refreshed auth cookies set above.
function redirectTo(
  request: NextRequest,
  response: NextResponse,
  pathname: string,
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}
