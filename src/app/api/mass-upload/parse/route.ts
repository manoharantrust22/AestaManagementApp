import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canPerformMassUpload } from "@/lib/permissions";
import { parseLegacyXlsx } from "@/lib/mass-upload/xlsxTemplate";

// exceljs needs the Node runtime (not edge).
export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB

async function verifyMassUploadAccess(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { authorized: false, error: "You must be logged in." };

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("auth_id", user.id)
    .single();
  const userProfile = profile as { role: string } | null;
  if (!userProfile || !canPerformMassUpload(userProfile.role)) {
    return { authorized: false, error: "Only Admin and Office staff can perform mass uploads." };
  }
  return { authorized: true, error: null };
}

/**
 * POST /api/mass-upload/parse  (multipart form-data: field "file" = .xlsx)
 * Reads the uploaded workbook's "Data" sheet into JSON rows (Record<string,string>[]),
 * the same shape the CSV path produces, so it flows into the existing validate→preview→import.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { authorized, error: authError } = await verifyMassUploadAccess(supabase);
    if (!authorized) {
      return NextResponse.json({ success: false, error: authError }, { status: 403 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "No file uploaded (expected form field 'file')." },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: "File is too large (max 10MB)." },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const rows = await parseLegacyXlsx(buffer);

    return NextResponse.json({
      success: true,
      fileName: file.name,
      rows,
      totalRows: rows.length,
    });
  } catch (error: unknown) {
    console.error("Error parsing xlsx:", error);
    const message =
      error instanceof Error ? error.message : "Could not read the Excel file.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
