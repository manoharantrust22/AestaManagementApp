import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  hasAccess,
  NO_ACCESS_EMAIL_COOKIE,
  type AccessRefusal,
} from "@/lib/auth/access";
import {
  ACCESS_COOKIE,
  ACCESS_COOKIE_TTL_SECONDS,
  signAccessCookie,
  verifyAccessCookie,
} from "@/lib/auth/accessCookie";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Refresh session if expired - wrapped in try/catch to prevent 500 errors
  // when Supabase is temporarily unreachable
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Supabase unreachable - treat as unauthenticated
  }

  // Protected routes - allow access to login and debug pages without authentication
  const isPublicRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/forgot-password") ||
    request.nextUrl.pathname.startsWith("/reset-password") ||
    // OAuth return leg: arrives before any session cookie exists.
    request.nextUrl.pathname.startsWith("/auth/callback") ||
    // Refused people are signed out and sent here.
    request.nextUrl.pathname.startsWith("/no-access") ||
    // Linked from Google's sign-in consent screen; must load signed out.
    request.nextUrl.pathname === "/privacy" ||
    request.nextUrl.pathname === "/terms" ||
    request.nextUrl.pathname.startsWith("/dev-login") ||
    request.nextUrl.pathname.startsWith("/api/dev-ensure-password") ||
    // Called by the DB (pg_net) with a shared secret — no user session.
    request.nextUrl.pathname === "/api/push/dispatch" ||
    // Called by Neram Admin with a signed request (task hub events) — no user
    // session. Exact path only: /api/neram/events/sync stays signed-in.
    request.nextUrl.pathname === "/api/neram/events" ||
    request.nextUrl.pathname.startsWith("/debug");

  // Check if this is an RSC (React Server Component) request
  // RSC requests have special headers that indicate client-side navigation
  const isRSCRequest =
    request.headers.get("RSC") === "1" ||
    request.headers.get("Next-Router-State-Tree") !== null;

  if (!user && !isPublicRoute) {
    // For RSC requests, return 401 JSON instead of redirect
    // This allows client-side to handle the session expiry gracefully
    // HTML redirects don't work properly for RSC requests (causes 404)
    if (isRSCRequest) {
      return new NextResponse(
        JSON.stringify({
          error: "Session expired",
          redirect: "/login?session_expired=true",
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            "X-Session-Expired": "true",
          },
        },
      );
    }

    // For regular requests, redirect as before
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("session_expired", "true");
    return NextResponse.redirect(url);
  }

  // App lock: being signed in is not enough. Every non-public request must
  // pass hasAccess (active users row + at least one company membership).
  // A recent "yes" is cached for 5 minutes in a signed httpOnly cookie tied
  // to this auth user (see accessCookie.ts); a "no" is never cached.
  let freshAccessCookie: string | null = null;
  if (user && !isPublicRoute) {
    const isApi = request.nextUrl.pathname.startsWith("/api/");
    // AuthContext's confirmation probe must always see a fresh answer.
    const bypassCache = request.nextUrl.pathname === "/api/auth/access";
    const cachedYes =
      !bypassCache &&
      (await verifyAccessCookie(
        request.cookies.get(ACCESS_COOKIE)?.value,
        user.id,
      ));
    let refusal: AccessRefusal | null = null;
    if (!cachedYes) {
      try {
        const t0 = Date.now();
        const access = await hasAccess(supabase, user.id);
        if (process.env.NODE_ENV !== "production") {
          console.log(
            `[middleware] hasAccess ${Date.now() - t0}ms ${request.nextUrl.pathname}`,
          );
        }
        if (!access.ok) refusal = access.reason;
        else freshAccessCookie = await signAccessCookie(user.id);
      } catch (err) {
        // Could not check (network / PostgREST). Never treat that as "no":
        // pages pass through (RLS and AuthContext still apply); API routes,
        // which often use the service role, fail closed with a retryable 503.
        console.error("[middleware] access check failed:", err);
        if (isApi) {
          return NextResponse.json(
            {
              error: "Could not check access. Please try again.",
              code: "access_check_failed",
            },
            { status: 503 },
          );
        }
      }
    }

    if (refusal) {
      // Sign out: revoke this session and clear its cookies (setAll above
      // writes the removals onto supabaseResponse, which we copy over).
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // Cookies are cleared explicitly below either way.
      }

      let res: NextResponse;
      if (isApi) {
        res = NextResponse.json(
          { error: "You don't have access to Aesta.", code: "no_access" },
          { status: 403, headers: { "X-No-Access": "true" } },
        );
      } else if (isRSCRequest) {
        // Redirects break RSC fetches; the client handler navigates instead.
        res = NextResponse.json(
          { error: "No access", redirect: "/no-access" },
          { status: 403, headers: { "X-No-Access": "true" } },
        );
      } else {
        const url = request.nextUrl.clone();
        url.pathname = "/no-access";
        url.search = "";
        url.searchParams.set("reason", refusal);
        res = NextResponse.redirect(url);
      }
      return refuseWithSignOut(res, supabaseResponse, request, user.email);
    }
  }

  // Redirect to site dashboard if user is logged in and trying to access login
  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/site/dashboard";
    return NextResponse.redirect(url);
  }

  // Redirect root to site dashboard for logged in users
  if (user && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/site/dashboard";
    return NextResponse.redirect(url);
  }

  if (freshAccessCookie) {
    supabaseResponse.cookies.set(ACCESS_COOKIE, freshAccessCookie, {
      path: "/",
      maxAge: ACCESS_COOKIE_TTL_SECONDS,
      sameSite: "lax",
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
    });
  }

  return supabaseResponse;
}

/**
 * Carry the sign-out cookie removals onto the refusal response, expire any
 * Supabase auth cookie still present on the request (including chunked
 * `.0`/`.1` parts), and leave the refused email for /no-access to show.
 */
function refuseWithSignOut(
  res: NextResponse,
  supabaseResponse: NextResponse,
  request: NextRequest,
  email: string | undefined,
): NextResponse {
  supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c));
  res.cookies.set(ACCESS_COOKIE, "", { path: "/", maxAge: 0 });
  request.cookies.getAll().forEach(({ name }) => {
    if (name.startsWith("sb-") && name.includes("-auth-token")) {
      res.cookies.set(name, "", { path: "/", maxAge: 0 });
    }
  });
  if (email) {
    res.cookies.set(NO_ACCESS_EMAIL_COOKIE, email, {
      path: "/",
      maxAge: 300,
      sameSite: "lax",
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
    });
  }
  return res;
}
