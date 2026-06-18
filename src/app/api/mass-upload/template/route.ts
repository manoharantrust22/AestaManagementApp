import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canPerformMassUpload } from "@/lib/permissions";
import { MassUploadTableName } from "@/types/mass-upload.types";
import { getTableConfig, generateTableSampleRows } from "@/lib/mass-upload/tableConfigs";
import { buildLegacyXlsxTemplate } from "@/lib/mass-upload/xlsxTemplate";
import Papa from "papaparse";

// exceljs needs the Node runtime (not edge).
export const runtime = "nodejs";

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
    return {
      authorized: false,
      error: "You must be logged in to perform this action.",
    };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("auth_id", user.id)
    .single();

  const userProfile = profile as { role: string } | null;

  if (!userProfile || !canPerformMassUpload(userProfile.role)) {
    return {
      authorized: false,
      error: "Only Admin and Office staff can perform mass uploads.",
    };
  }

  return { authorized: true, error: null, userProfile };
}

/**
 * GET /api/mass-upload/template?table=daily_attendance&samples=2
 * Returns CSV template for the specified table with sample data rows
 *
 * Query parameters:
 * - table: The table name (required)
 * - samples: Number of sample rows to include (default: 2, max: 5)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify access
    const { authorized, error: authError } = await verifyMassUploadAccess(supabase);
    if (!authorized) {
      return NextResponse.json(
        { success: false, error: authError },
        { status: 403 }
      );
    }

    // Get parameters from query
    const { searchParams } = new URL(request.url);
    const tableName = searchParams.get("table") as MassUploadTableName | null;
    const samplesParam = searchParams.get("samples");
    const numSamples = Math.min(Math.max(parseInt(samplesParam || "2", 10) || 2, 0), 5);

    if (!tableName) {
      return NextResponse.json(
        { success: false, error: "Table name is required. Use ?table=daily_attendance" },
        { status: 400 }
      );
    }

    // Get table config
    const config = getTableConfig(tableName);
    if (!config || config.fields.length === 0) {
      return NextResponse.json(
        { success: false, error: `No template configuration found for table: ${tableName}` },
        { status: 400 }
      );
    }

    // Legacy importer: per-site .xlsx with dropdowns restricted to the site's real values.
    if (tableName === "legacy_misc_expenses") {
      const siteId = searchParams.get("siteId");
      if (!siteId) {
        return NextResponse.json(
          { success: false, error: "Select a site first — the template's dropdowns are built from the site's payment sources, subcontracts and categories." },
          { status: 400 }
        );
      }
      const xlsx = await buildLegacyXlsxTemplate(supabase, siteId);
      return new NextResponse(xlsx, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="legacy_expenses_template.xlsx"`,
        },
      });
    }

    // Get field names as headers
    const headers = config.fields.map(field => field.csvHeader);

    // Generate sample rows
    const sampleRows: string[][] = [];
    if (numSamples > 0) {
      const samples = generateTableSampleRows(tableName, numSamples);
      for (const sample of samples) {
        const row = headers.map(header => sample[header] || '');
        sampleRows.push(row);
      }
    }

    // Generate CSV content
    const csvContent = Papa.unparse({
      fields: headers,
      data: sampleRows,
    });

    // Return as downloadable CSV
    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${tableName}_template.csv"`,
      },
    });
  } catch (error: unknown) {
    console.error("Error generating template:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * POST /api/mass-upload/template
 * Returns template info (fields, sample data) as JSON for UI display
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify access
    const { authorized, error: authError } = await verifyMassUploadAccess(supabase);
    if (!authorized) {
      return NextResponse.json(
        { success: false, error: authError },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { tableName, numSamples = 2 } = body as { tableName: MassUploadTableName; numSamples?: number };

    if (!tableName) {
      return NextResponse.json(
        { success: false, error: "Table name is required" },
        { status: 400 }
      );
    }

    // Get table config
    const config = getTableConfig(tableName);
    if (!config || config.fields.length === 0) {
      return NextResponse.json(
        { success: false, error: `No configuration found for table: ${tableName}` },
        { status: 400 }
      );
    }

    // Generate sample rows
    const sampleRows = generateTableSampleRows(tableName, Math.min(numSamples, 5));

    return NextResponse.json({
      success: true,
      tableName,
      displayName: config.displayName,
      description: config.description,
      fields: config.fields.map(f => ({
        dbField: f.dbField,
        csvHeader: f.csvHeader,
        required: f.required,
        type: f.type,
        enumValues: f.enumValues,
        lookupTable: f.lookupTable,
      })),
      sampleRows,
      requiredContext: config.requiredContext,
    });
  } catch (error: unknown) {
    console.error("Error getting template info:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
