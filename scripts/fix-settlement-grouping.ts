/**
 * Script to fix settlement grouping
 *
 * Problem: The restoration script grouped attendance records by payment_date,
 * but each work DATE should have its own unique ref code.
 *
 * This script:
 * 1. Deletes the incorrectly grouped settlement_groups (restored ones)
 * 2. Recreates settlement_groups with ONE per work date
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Read .env.local manually
const envPath = path.join(process.cwd(), ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
envContent.split("\n").forEach((line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim();
  }
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  (env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY)
);

async function fixSettlementGrouping() {
  console.log("=== FIXING SETTLEMENT GROUPING ===\n");

  // Step 1: Find the subcontract
  const { data: subcontracts } = await supabase
    .from("subcontracts")
    .select("id, title, site_id")
    .ilike("title", "%House Construction%Srinivasan%");

  const subcontract = subcontracts?.[0];
  if (!subcontract) {
    console.error("Subcontract not found!");
    return;
  }

  console.log(`Subcontract: "${subcontract.title}" (${subcontract.id})`);
  const siteId = subcontract.site_id;

  // Step 2: Delete the incorrectly restored settlement_groups
  console.log("\nStep 1: Deleting incorrectly grouped settlements...");

  const { data: restoredSettlements } = await supabase
    .from("settlement_groups")
    .select("id, settlement_reference")
    .eq("site_id", siteId)
    .ilike("created_by_name", "%System Recovery%");

  if (restoredSettlements && restoredSettlements.length > 0) {
    console.log(`Found ${restoredSettlements.length} restored settlements to delete`);

    // First, clear settlement_group_id from attendance records
    for (const sg of restoredSettlements) {
      await supabase
        .from("daily_attendance")
        .update({ settlement_group_id: null })
        .eq("settlement_group_id", sg.id);

      await supabase
        .from("market_laborer_attendance")
        .update({ settlement_group_id: null })
        .eq("settlement_group_id", sg.id);
    }

    // Delete the settlement_groups
    const sgIds = restoredSettlements.map(s => s.id);
    const { error: deleteErr } = await (supabase as any)
      .from("settlement_groups")
      .delete()
      .in("id", sgIds);

    if (deleteErr) {
      console.error("Error deleting settlements:", deleteErr.message);
      return;
    }
    console.log(`Deleted ${restoredSettlements.length} settlements`);
  } else {
    console.log("No restored settlements found to delete");
  }

  // Step 3: Get all paid daily attendance records grouped by DATE (not payment_date)
  console.log("\nStep 2: Fetching paid attendance records...");

  const { data: paidDailyAttendance } = await supabase
    .from("daily_attendance")
    .select(`
      id,
      site_id,
      laborer_id,
      date,
      daily_earnings,
      is_paid,
      payment_date,
      payment_mode,
      payer_source,
      payer_name,
      payment_proof_url,
      payment_notes,
      engineer_transaction_id,
      subcontract_id
    `)
    .eq("site_id", siteId)
    .eq("is_paid", true)
    .is("settlement_group_id", null);

  console.log(`Found ${paidDailyAttendance?.length || 0} paid daily attendance records`);

  const { data: paidMarketAttendance } = await supabase
    .from("market_laborer_attendance")
    .select(`
      id,
      site_id,
      date,
      total_cost,
      count,
      is_paid,
      payment_date,
      payment_mode,
      payer_source,
      payer_name,
      payment_proof_url,
      payment_notes,
      engineer_transaction_id,
      subcontract_id
    `)
    .eq("site_id", siteId)
    .eq("is_paid", true)
    .is("settlement_group_id", null);

  console.log(`Found ${paidMarketAttendance?.length || 0} paid market attendance records`);

  // Step 4: Group by work DATE (the 'date' field, not payment_date)
  // Each unique date should get ONE settlement ref code

  // Group daily attendance by date
  const dailyByDate = new Map<string, typeof paidDailyAttendance>();
  for (const record of paidDailyAttendance || []) {
    const dateKey = record.date; // Work date
    if (!dailyByDate.has(dateKey)) {
      dailyByDate.set(dateKey, []);
    }
    dailyByDate.get(dateKey)!.push(record);
  }

  // Group market attendance by date
  const marketByDate = new Map<string, typeof paidMarketAttendance>();
  for (const record of paidMarketAttendance || []) {
    const dateKey = record.date; // Work date
    if (!marketByDate.has(dateKey)) {
      marketByDate.set(dateKey, []);
    }
    marketByDate.get(dateKey)!.push(record);
  }

  console.log(`\nDaily attendance grouped into ${dailyByDate.size} dates`);
  console.log(`Market attendance grouped into ${marketByDate.size} dates`);

  // Step 5: Get current max settlement reference number
  const currentMonth = new Date().toISOString().slice(0, 7).replace("-", "");
  const { data: existingRefs } = await supabase
    .from("settlement_groups")
    .select("settlement_reference")
    .like("settlement_reference", `SET-${currentMonth}-%`)
    .order("settlement_reference", { ascending: false })
    .limit(1);

  let refCounter = 1;
  if (existingRefs && existingRefs.length > 0) {
    const lastRef = existingRefs[0].settlement_reference;
    const lastNum = parseInt(lastRef.split("-")[2], 10);
    refCounter = lastNum + 1;
  }

  console.log(`\nStarting ref counter at: SET-${currentMonth}-${String(refCounter).padStart(3, "0")}`);

  // Step 6: Create settlement_groups - ONE per date
  let createdCount = 0;
  let errorCount = 0;

  // Combine daily and market records by date
  const allDates = new Set([...dailyByDate.keys(), ...marketByDate.keys()]);
  const sortedDates = Array.from(allDates).sort();

  console.log(`\nCreating settlements for ${sortedDates.length} unique dates...`);

  for (const workDate of sortedDates) {
    const dailyRecords = dailyByDate.get(workDate) || [];
    const marketRecords = marketByDate.get(workDate) || [];

    const dailyTotal = dailyRecords.reduce((sum, r) => sum + (r.daily_earnings || 0), 0);
    const marketTotal = marketRecords.reduce((sum, r) => sum + (r.total_cost || 0), 0);
    const totalAmount = dailyTotal + marketTotal;

    if (totalAmount === 0) continue;

    const dailyLaborerCount = new Set(dailyRecords.map(r => r.laborer_id)).size;
    const marketCount = marketRecords.reduce((sum, r) => sum + (r.count || 0), 0);
    const laborerCount = dailyLaborerCount + marketCount;

    // Use info from first record for payment details
    const firstRecord = dailyRecords[0] || marketRecords[0];
    const settlementRef = `SET-${currentMonth}-${String(refCounter).padStart(3, "0")}`;

    // Create settlement_group
    const { data: newSettlement, error: sgErr } = await (supabase as any)
      .from("settlement_groups")
      .insert({
        site_id: siteId,
        settlement_reference: settlementRef,
        settlement_date: firstRecord.payment_date || workDate, // Use payment_date if available
        actual_payment_date: firstRecord.payment_date || workDate,
        total_amount: totalAmount,
        laborer_count: laborerCount,
        payment_mode: firstRecord.payment_mode || "cash",
        payment_channel: firstRecord.engineer_transaction_id ? "engineer_wallet" : "direct",
        payer_source: firstRecord.payer_source,
        payer_name: firstRecord.payer_name,
        proof_url: firstRecord.payment_proof_url,
        notes: `Work date: ${workDate}`,
        engineer_transaction_id: firstRecord.engineer_transaction_id,
        settlement_type: "date_wise",
        subcontract_id: subcontract.id,
        is_cancelled: false,
        created_by_name: "System Recovery (fixed)",
      })
      .select()
      .single();

    if (sgErr) {
      console.error(`  Error creating settlement for ${workDate}:`, sgErr.message);
      errorCount++;
      continue;
    }

    // Update daily attendance records
    if (dailyRecords.length > 0) {
      const dailyIds = dailyRecords.map(r => r.id);
      await supabase
        .from("daily_attendance")
        .update({ settlement_group_id: newSettlement.id })
        .in("id", dailyIds);
    }

    // Update market attendance records
    if (marketRecords.length > 0) {
      const marketIds = marketRecords.map(r => r.id);
      await supabase
        .from("market_laborer_attendance")
        .update({ settlement_group_id: newSettlement.id })
        .in("id", marketIds);
    }

    console.log(`  ✓ ${settlementRef}: ${workDate} - Rs.${totalAmount} (${laborerCount} workers)`);
    createdCount++;
    refCounter++;
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Created: ${createdCount} settlement groups (one per date)`);
  console.log(`Errors: ${errorCount}`);
  console.log("\nEach work date now has its own unique ref code.");
}

// Run the fix
fixSettlementGrouping().catch(console.error);
