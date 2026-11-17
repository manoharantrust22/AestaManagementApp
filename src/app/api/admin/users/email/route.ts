import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdminAccess } from "@/lib/auth/admin";
import { changeLoginEmail, resolveAdminCompany } from "@/lib/auth/people";

/**
 * Change the email a person signs in with (admin only). Their user id and
 * all their data stay the same; only the login email moves.
 * Body: { userId, email }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const access = await verifyAdminAccess(supabase);
  if (!access.authorized) {
    return NextResponse.json({ success: false, error: access.error }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const company = await resolveAdminCompany(admin, access.userId, null);
    if (!company.ok) {
      return NextResponse.json({ success: false, error: company.error, code: company.code }, { status: company.status });
    }
    const result = await changeLoginEmail(admin, { userId: body.userId, email: body.email }, company.companyIds);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error, code: result.code }, { status: result.status });
    }
    return NextResponse.json({
      success: true,
      email: result.email,
      message: "They will sign in with the new email from now on. Their data stays the same.",
    });
  } catch (err) {
    console.error("[admin/users/email] failed:", err);
    return NextResponse.json(
      { success: false, error: "Could not change the login email. Please try again." },
      { status: 500 }
    );
  }
}
