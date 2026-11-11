import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
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
    request.nextUrl.pathname.startsWith("/dev-login") ||
    request.nextUrl.pathname.startsWith("/api/dev-ensure-password") ||
    // Called by the DB (pg_net) with a shared secret — no user session.
    request.nextUrl.pathname === "/api/push/dispatch" ||
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
        }
      );
    }

    // For regular requests, redirect as before
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("session_expired", "true");
    return NextResponse.redirect(url);
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

  return supabaseResponse;
}
