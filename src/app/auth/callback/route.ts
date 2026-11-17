import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AccessCheckError, hasAccess, NO_ACCESS_EMAIL_COOKIE } from "@/lib/auth/access";
import { safeNextPath } from "@/lib/auth/redirect";

export const dynamic = "force-dynamic";

/**
 * The return leg of "Continue with Microsoft / Google".
 *
 * Supabase sends the browser here with ?code=... (PKCE). We swap the code for
 * a session (cookies), then run the same app lock as the middleware: a person
 * with no active users row or no company is signed out at once and sent to
 * /no-access. A provider error (?error=...) goes back to /login, which turns
 * it into plain words.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;
  const next = safeNextPath(url.searchParams.get("next"));

  const toLogin = (params: Record<string, string>) => {
    const dest = new URL("/login", origin);
    for (const [k, v] of Object.entries(params)) if (v) dest.searchParams.set(k, v.slice(0, 300));
    return NextResponse.redirect(dest);
  };

  const providerError = url.searchParams.get("error");
  if (providerError) {
    return toLogin({
      error: providerError,
      error_code: url.searchParams.get("error_code") ?? "",
      error_description: url.searchParams.get("error_description") ?? "",
    });
  }

  const code = url.searchParams.get("code");
  if (!code) return toLogin({ error: "missing_code" });

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    console.warn("[auth/callback] code exchange failed:", error?.message);
    return toLogin({ error: "exchange_failed", error_code: error?.code ?? "" });
  }
  const user = data.user;

  let access;
  try {
    access = await hasAccess(supabase, user.id);
  } catch (err) {
    // Could not check: let the middleware decide on the next page, as it
    // does for every request. Never treat "could not check" as "no".
    if (!(err instanceof AccessCheckError)) throw err;
    console.error("[auth/callback] access check failed:", err);
    return NextResponse.redirect(new URL(next, origin));
  }

  if (!access.ok) {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Cookies are removed by signOut's setAll either way.
    }
    const cookieStore = await cookies();
    if (user.email) {
      cookieStore.set(NO_ACCESS_EMAIL_COOKIE, user.email, {
        path: "/",
        maxAge: 300,
        sameSite: "lax",
        httpOnly: true,
        secure: url.protocol === "https:",
      });
    }
    const dest = new URL("/no-access", origin);
    dest.searchParams.set("reason", access.reason);
    return NextResponse.redirect(dest);
  }

  // Best effort: a failed timestamp must not block the sign-in.
  try {
    await createAdminClient()
      .from("users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", access.userId);
  } catch (err) {
    console.warn("[auth/callback] last_login_at not updated:", err);
  }

  return NextResponse.redirect(new URL(next, origin));
}
