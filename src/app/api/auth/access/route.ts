import { NextResponse } from "next/server";

/**
 * Authoritative "may I use Aesta?" probe for the browser.
 *
 * The real work happens in middleware: a refused caller never reaches this
 * handler — it gets 403 `{ code: 'no_access' }` and its session cookies are
 * cleared. Reaching here means hasAccess said yes. AuthContext calls this
 * before signing anyone out, so a flaky client-side profile read can never
 * log a valid person out on its own.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
