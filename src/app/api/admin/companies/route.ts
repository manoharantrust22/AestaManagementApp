import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdminAccess } from "@/lib/auth/admin";

/**
 * Create a company and make the calling admin its owner.
 *
 * Admin only (server-side check). Writes go through the service-role client
 * so the open `companies` INSERT policy can be removed — no browser can
 * create a company directly. Later this moves to a platform-owner check.
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

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const name = str(body.name);
  const code = str(body.code).toUpperCase();
  const city = str(body.city);

  if (!name) return bad("Company name is required");
  if (!code) return bad("Company code is required");
  if (code.length < 2 || code.length > 20) return bad("Company code must be 2-20 characters");
  if (!/^[A-Z0-9_-]+$/.test(code))
    return bad("Company code can only contain letters, numbers, hyphens, and underscores");
  if (!city) return bad("City is required");

  const admin = createAdminClient();

  const { data: company, error: companyError } = await admin
    .from("companies")
    .insert({
      name,
      code,
      city,
      phone: str(body.phone) || null,
      email: str(body.email) || null,
      address: str(body.address) || null,
      gst_number: str(body.gst_number) || null,
      is_active: true,
    })
    .select("id")
    .single();

  if (companyError || !company) {
    if (companyError?.code === "23505") {
      return bad("A company with this code already exists. Please choose a different code.");
    }
    console.error("[admin/companies] create failed:", companyError);
    return NextResponse.json(
      { success: false, error: "Failed to register company. Please try again." },
      { status: 500 }
    );
  }

  // Primary only if this is the admin's first company.
  const { count } = await admin
    .from("company_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", access.userId);

  const { error: memberError } = await admin.from("company_members").insert({
    company_id: company.id,
    user_id: access.userId,
    role: "owner",
    is_primary: (count ?? 0) === 0,
  });

  if (memberError) {
    // Undo: members cascade on company delete.
    await admin.from("companies").delete().eq("id", company.id);
    console.error("[admin/companies] owner membership failed:", memberError);
    return NextResponse.json(
      { success: false, error: "Failed to register company. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, companyId: company.id }, { status: 201 });
}

function bad(error: string) {
  return NextResponse.json({ success: false, error }, { status: 400 });
}
