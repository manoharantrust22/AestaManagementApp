import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// This API route backfills settlement_group_id for paid attendance records
// that don't have a settlement_group_id set (legacy data)

export async function POST(req: NextRequest) {
  try {
    // Use admin client with service role key
    const supabase = createAdminClient();

    // Get all paid daily_attendance without settlement_group_id (excluding contract laborers)
    // Note: laborer_type is on the laborers table, so we need to join
    const { data: dailyRecords, error: dailyError } = await supabase
      .from("daily_attendance")
      .select("id, site_id, date, daily_earnings, payer_source, payer_name, payment_mode, laborers!daily_attendance_laborer_id_fkey!inner(laborer_type)")
      .eq("is_paid", true)
      .is("settlement_group_id", null)
      .neq("laborers.laborer_type", "contract");

    if (dailyError) {
      console.error("Error fetching daily records:", dailyError);
      return NextResponse.json(
        { error: "Failed to fetch daily records", details: dailyError.message },
        { status: 500 }
      );
    }

    // Get all paid market_laborer_attendance without settlement_group_id
    const { data: marketRecords, error: marketError } = await supabase
      .from("market_laborer_attendance")
      .select("id, site_id, date, total_cost, payer_source, payer_name, payment_mode")
      .eq("is_paid", true)
      .is("settlement_group_id", null);

    if (marketError) {
      console.error("Error fetching market records:", marketError);
      return NextResponse.json(
        { error: "Failed to fetch market records", details: marketError.message },
        { status: 500 }
      );
    }

    // Group by site_id + date
    interface GroupData {
      siteId: string;
      date: string;
      dailyIds: string[];
      marketIds: string[];
      totalAmount: number;
      payerSource: string;
      payerName: string;
      paymentMode: string;
    }

    const groups = new Map<string, GroupData>();

    for (const r of dailyRecords || []) {
      const key = `${r.site_id}-${r.date}`;
      if (!groups.has(key)) {
        groups.set(key, {
          siteId: r.site_id,
          date: r.date,
          dailyIds: [],
          marketIds: [],
          totalAmount: 0,
          payerSource: r.payer_source || "own_money",
          payerName: r.payer_name || "",
          paymentMode: r.payment_mode || "cash",
        });
      }
      const g = groups.get(key)!;
      g.dailyIds.push(r.id);
      g.totalAmount += r.daily_earnings || 0;
    }

    for (const r of marketRecords || []) {
      const key = `${r.site_id}-${r.date}`;
      if (!groups.has(key)) {
        groups.set(key, {
          siteId: r.site_id,
          date: r.date,
          dailyIds: [],
          marketIds: [],
          totalAmount: 0,
          payerSource: r.payer_source || "own_money",
          payerName: r.payer_name || "",
          paymentMode: r.payment_mode || "cash",
        });
      }
      const g = groups.get(key)!;
      g.marketIds.push(r.id);
      g.totalAmount += r.total_cost || 0;
    }

    console.log(`Found ${groups.size} groups to backfill`);

    const results: { key: string; ref: string; success: boolean; error?: string }[] = [];

    // Process each group
    for (const [key, group] of groups) {
      try {
        // Generate settlement reference using RPC
        const { data: refData, error: refError } = await supabase.rpc(
          "generate_settlement_reference",
          { p_site_id: group.siteId }
        );

        // Fallback if RPC fails
        const dateForRef = group.date.replace(/-/g, "").slice(2); // Convert 2026-01-09 to 260109
        const settlementRef = refError || !refData
          ? `SET-${dateForRef}-BF${Math.random().toString(36).slice(2, 6).toUpperCase()}`
          : refData as string;

        // Create settlement_group
        const { data: sgData, error: sgError } = await (supabase
          .from("settlement_groups") as any)
          .insert({
            settlement_reference: settlementRef,
            site_id: group.siteId,
            settlement_date: group.date,
            total_amount: group.totalAmount,
            laborer_count: group.dailyIds.length + group.marketIds.length,
            payment_channel: "direct",
            payment_mode: group.paymentMode,
            payer_source: group.payerSource,
            payer_name: group.payerName || null,
            created_by_name: "Backfill Script",
          })
          .select()
          .single();

        if (sgError) {
          console.error(`Error creating settlement_group for ${key}:`, sgError);
          results.push({ key, ref: settlementRef, success: false, error: sgError.message });
          continue;
        }

        const settlementGroupId = sgData?.id;

        // Update daily_attendance records
        if (group.dailyIds.length > 0 && settlementGroupId) {
          const { error: updateDailyError } = await supabase
            .from("daily_attendance")
            .update({ settlement_group_id: settlementGroupId })
            .in("id", group.dailyIds);

          if (updateDailyError) {
            console.error(`Error updating daily records for ${key}:`, updateDailyError);
          }
        }

        // Update market_laborer_attendance records
        if (group.marketIds.length > 0 && settlementGroupId) {
          const { error: updateMarketError } = await supabase
            .from("market_laborer_attendance")
            .update({ settlement_group_id: settlementGroupId })
            .in("id", group.marketIds);

          if (updateMarketError) {
            console.error(`Error updating market records for ${key}:`, updateMarketError);
          }
        }

        console.log(`Backfilled ${key} with ref ${settlementRef}`);
        results.push({ key, ref: settlementRef, success: true });
      } catch (err: any) {
        console.error(`Error processing ${key}:`, err);
        results.push({ key, ref: "", success: false, error: err.message });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return NextResponse.json({
      message: "Backfill complete",
      totalGroups: groups.size,
      success: successCount,
      failed: failCount,
      results,
    });
  } catch (err: any) {
    console.error("Backfill error:", err);
    return NextResponse.json(
      { error: "Backfill failed", details: err.message },
      { status: 500 }
    );
  }
}

// GET endpoint to check status (how many records need backfill)
export async function GET() {
  try {
    const supabase = createAdminClient();

    // Count daily attendance records needing backfill (excluding contract laborers)
    const { count: dailyCount } = await supabase
      .from("daily_attendance")
      .select("*, laborers!daily_attendance_laborer_id_fkey!inner(laborer_type)", { count: "exact", head: true })
      .eq("is_paid", true)
      .is("settlement_group_id", null)
      .neq("laborers.laborer_type", "contract");

    // Count market attendance records needing backfill
    const { count: marketCount } = await supabase
      .from("market_laborer_attendance")
      .select("*", { count: "exact", head: true })
      .eq("is_paid", true)
      .is("settlement_group_id", null);

    return NextResponse.json({
      message: "Backfill status",
      dailyRecordsNeedingBackfill: dailyCount || 0,
      marketRecordsNeedingBackfill: marketCount || 0,
      totalRecordsNeedingBackfill: (dailyCount || 0) + (marketCount || 0),
    });
  } catch (err: any) {
    console.error("Status check error:", err);
    return NextResponse.json(
      { error: "Status check failed", details: err.message },
      { status: 500 }
    );
  }
}
