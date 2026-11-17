import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Dev-only auto login used by /dev-login and Playwright.
 *
 * The account and password come from server-only env vars
 * (DEV_LOGIN_EMAIL, DEV_LOGIN_PASSWORD) — never from code — and the route
 * refuses unless dev login is switched on AND this is not a production
 * build. It sets the password through the GoTrue admin API (correct bcrypt
 * format), then signs in on the server so the session arrives as cookies:
 * the password never reaches the browser.
 *
 * Note: every call RESETS that account's password to DEV_LOGIN_PASSWORD.
 * Point it at a dedicated test account, not a real person's login.
 */
export async function POST() {
  if (
    process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN !== "true" ||
    process.env.NODE_ENV === "production"
  ) {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  const email = process.env.DEV_LOGIN_EMAIL?.trim().toLowerCase();
  const password = process.env.DEV_LOGIN_PASSWORD;
  if (!email || !password) {
    return NextResponse.json(
      {
        error:
          "Set DEV_LOGIN_EMAIL and DEV_LOGIN_PASSWORD in .env.cloud.local (or .env.local) to use dev login.",
      },
      { status: 500 }
    );
  }

  const adminClient = createAdminClient();

  // Find the auth user id via the public profile (indexed lookup) rather than
  // paging through every auth user.
  const { data: profile, error: profileError } = await adminClient
    .from("users")
    .select("auth_id")
    // Case-insensitive exact match; escape LIKE wildcards in the address.
    .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
    .maybeSingle();
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }
  if (!profile?.auth_id) {
    return NextResponse.json(
      { error: "Dev user not found (no users row for DEV_LOGIN_EMAIL)." },
      { status: 404 }
    );
  }

  const { error: updateError } = await adminClient.auth.admin.updateUserById(
    profile.auth_id,
    { password }
  );
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Sign in with the cookie-backed server client: the session cookies are
  // written onto this response, and the browser client picks them up.
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    return NextResponse.json({ error: signInError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
