import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canPerformMassUpload } from "@/lib/permissions";
import { ValidateRequest, ValidateResponse } from "@/types/mass-upload.types";
import { getTableConfig } from "@/lib/mass-upload/tableConfigs";
import { validateRowsServerSide } from "@/lib/mass-upload/serverValidate";

/**
 * Verify mass upload access
 */
async function verifyMassUploadAccess(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { authorized: false, error: "You must be logged in to perform this action." };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role, name")
    .eq("auth_id", user.id)
    .single();

  const userProfile = profile as { role: string; name: string } | null;

  if (!userProfile || !canPerformMassUpload(userProfile.role)) {
    return { authorized: false, error: "Only Admin and Office staff can perform mass uploads." };
  }

  return { authorized: true, error: null };
}

/**
 * POST /api/mass-upload/validate
 * Validates CSV data including server-side lookups
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { authorized, error: authError } = await verifyMassUploadAccess(supabase);
    if (!authorized) {
      return NextResponse.json({ success: false, error: authError }, { status: 403 });
    }

    const body: ValidateRequest = await request.json();
    const { tableName, siteId, rows, requiredFields } = body;

    if (!tableName || !rows || !Array.isArray(rows)) {
      return NextResponse.json(
        { success: false, error: "Table name and rows are required" },
        { status: 400 }
      );
    }

    const config = getTableConfig(tableName);
    if (!config || config.fields.length === 0) {
      return NextResponse.json(
        { success: false, error: `No configuration found for table: ${tableName}` },
        { status: 400 }
      );
    }

    const { parsedRows, lookupErrors, summary, legacySummary } =
      await validateRowsServerSide(supabase, tableName, siteId || "", rows, requiredFields ?? []);

    const response: ValidateResponse = {
      success: true,
      parsedRows,
      lookupErrors,
      summary,
      ...(legacySummary ? { legacySummary } : {}),
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    console.error("Validation error:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
