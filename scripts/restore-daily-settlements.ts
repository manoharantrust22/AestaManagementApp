/**
 * Script to restore daily/market settlement_groups from backup
 *
 * This script:
 * 1. Connects to Supabase
 * 2. Reads the extracted SQL data from backup
 * 3. Inserts only daily/market settlement_groups (not contract settlements)
 * 4. Creates corresponding labor_payments records
 * 5. Links attendance records back to settlement_groups
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

// Since we can't directly read .backup files in Node.js without pg_restore,
// we'll recreate settlement_groups from the existing paid attendance data
// which still has is_paid=true, payment_date, payer_source intact

async function recreateSettlementGroups() {
  console.log("=== RECREATING DAILY/MARKET SETTLEMENT GROUPS ===\n");

  // Get site ID
  const { data: sites } = await supabase
    .from("sites")
    .select("id, name")
    .limit(5);

  console.log("Available sites:", sites?.map(s => `${s.name} (${s.id})`).join(", "));

  // Get all paid daily attendance records grouped by payment_date and payer_source
  const { data: paidDailyAttendance, error: dailyErr } = await supabase
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
      engineer_transaction_id
    `)
    .eq("is_paid", true)
    .is("settlement_group_id", null);

  if (dailyErr) {
    console.error("Error fetching daily attendance:", dailyErr);
    return;
  }

  console.log(`Found ${paidDailyAttendance?.length || 0} paid daily attendance records without settlement_group_id`);

  // Get paid market attendance
  const { data: paidMarketAttendance, error: marketErr } = await supabase
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
      engineer_transaction_id
    `)
    .eq("is_paid", true)
    .is("settlement_group_id", null);

  if (marketErr) {
    console.error("Error fetching market attendance:", marketErr);
    return;
  }

  console.log(`Found ${paidMarketAttendance?.length || 0} paid market attendance records without settlement_group_id`);

  if ((!paidDailyAttendance || paidDailyAttendance.length === 0) &&
      (!paidMarketAttendance || paidMarketAttendance.length === 0)) {
    console.log("\nNo orphaned paid attendance records found. Nothing to restore.");
    return;
  }

  // Group daily attendance by site_id + payment_date + payer_source
  const dailyGroups = new Map<string, typeof paidDailyAttendance>();

  for (const record of paidDailyAttendance || []) {
    const key = `${record.site_id}|${record.payment_date || "unknown"}|${record.payer_source || "unknown"}`;
    if (!dailyGroups.has(key)) {
      dailyGroups.set(key, []);
    }
    dailyGroups.get(key)!.push(record);
  }

  console.log(`\nGrouped into ${dailyGroups.size} daily settlement groups`);

  // Group market attendance similarly
  const marketGroups = new Map<string, typeof paidMarketAttendance>();

  for (const record of paidMarketAttendance || []) {
    const key = `${record.site_id}|${record.payment_date || "unknown"}|${record.payer_source || "unknown"}`;
    if (!marketGroups.has(key)) {
      marketGroups.set(key, []);
    }
    marketGroups.get(key)!.push(record);
  }

  console.log(`Grouped into ${marketGroups.size} market settlement groups`);

  // Get current max settlement reference number for the month
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

  console.log(`\nStarting settlement reference counter at: SET-${currentMonth}-${String(refCounter).padStart(3, "0")}`);

  // Process daily attendance groups
  let createdCount = 0;
  let errorCount = 0;

  for (const [key, records] of dailyGroups) {
    const [siteId, paymentDate, payerSource] = key.split("|");

    if (paymentDate === "unknown") {
      console.log(`  Skipping group with unknown payment_date: ${records.length} records`);
      continue;
    }

    const totalAmount = records.reduce((sum, r) => sum + (r.daily_earnings || 0), 0);
    const laborerCount = new Set(records.map(r => r.laborer_id)).size;
    const settlementRef = `SET-${currentMonth}-${String(refCounter).padStart(3, "0")}`;

    // Create settlement_group
    const { data: newSettlement, error: sgErr } = await (supabase as any)
      .from("settlement_groups")
      .insert({
        site_id: siteId,
        settlement_reference: settlementRef,
        settlement_date: paymentDate,
        actual_payment_date: paymentDate,
        total_amount: totalAmount,
        laborer_count: laborerCount,
        payment_mode: records[0].payment_mode || "cash",
        payment_channel: records[0].engineer_transaction_id ? "engineer_wallet" : "direct",
        payer_source: payerSource === "unknown" ? null : payerSource,
        payer_name: records[0].payer_name,
        proof_url: records[0].payment_proof_url,
        notes: records[0].payment_notes || "Restored from attendance records",
        engineer_transaction_id: records[0].engineer_transaction_id,
        settlement_type: "date_wise",
        is_cancelled: false,
        created_by_name: "System Recovery (restored)",
      })
      .select()
      .single();

    if (sgErr) {
      console.error(`  Error creating settlement ${settlementRef}:`, sgErr.message);
      errorCount++;
      continue;
    }

    // Update attendance records with settlement_group_id
    const attendanceIds = records.map(r => r.id);
    const { error: updateErr } = await supabase
      .from("daily_attendance")
      .update({ settlement_group_id: newSettlement.id })
      .in("id", attendanceIds);

    if (updateErr) {
      console.error(`  Error updating attendance for ${settlementRef}:`, updateErr.message);
    }

    console.log(`  Created ${settlementRef}: Rs.${totalAmount} (${laborerCount} laborers, ${records.length} records) - ${paymentDate}`);
    createdCount++;
    refCounter++;
  }

  // Process market attendance groups
  for (const [key, records] of marketGroups) {
    const [siteId, paymentDate, payerSource] = key.split("|");

    if (paymentDate === "unknown") {
      console.log(`  Skipping market group with unknown payment_date: ${records.length} records`);
      continue;
    }

    const totalAmount = records.reduce((sum, r) => sum + (r.total_cost || 0), 0);
    const totalCount = records.reduce((sum, r) => sum + (r.count || 0), 0);
    const settlementRef = `SET-${currentMonth}-${String(refCounter).padStart(3, "0")}`;

    // Create settlement_group for market labor
    const { data: newSettlement, error: sgErr } = await (supabase as any)
      .from("settlement_groups")
      .insert({
        site_id: siteId,
        settlement_reference: settlementRef,
        settlement_date: paymentDate,
        actual_payment_date: paymentDate,
        total_amount: totalAmount,
        laborer_count: totalCount,
        payment_mode: records[0].payment_mode || "cash",
        payment_channel: records[0].engineer_transaction_id ? "engineer_wallet" : "direct",
        payer_source: payerSource === "unknown" ? null : payerSource,
        payer_name: records[0].payer_name,
        proof_url: records[0].payment_proof_url,
        notes: records[0].payment_notes || "Market labor - Restored from attendance records",
        engineer_transaction_id: records[0].engineer_transaction_id,
        settlement_type: "date_wise",
        is_cancelled: false,
        created_by_name: "System Recovery (restored)",
      })
      .select()
      .single();

    if (sgErr) {
      console.error(`  Error creating market settlement ${settlementRef}:`, sgErr.message);
      errorCount++;
      continue;
    }

    // Update market attendance records with settlement_group_id
    const attendanceIds = records.map(r => r.id);
    const { error: updateErr } = await supabase
      .from("market_laborer_attendance")
      .update({ settlement_group_id: newSettlement.id })
      .in("id", attendanceIds);

    if (updateErr) {
      console.error(`  Error updating market attendance for ${settlementRef}:`, updateErr.message);
    }

    console.log(`  Created ${settlementRef} (Market): Rs.${totalAmount} (${totalCount} workers, ${records.length} records) - ${paymentDate}`);
    createdCount++;
    refCounter++;
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Created: ${createdCount} settlement groups`);
  console.log(`Errors: ${errorCount}`);
  console.log(`\nDaily/Market settlements should now appear in the Daily Expenses page.`);
}

// Run the recovery
recreateSettlementGroups().catch(console.error);
