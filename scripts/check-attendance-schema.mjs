/**
 * Check the actual column names in attendance tables
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnvFile(filePath) {
  try {
    const content = readFileSync(filePath, "utf-8");
    content.split("\n").forEach((line) => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  } catch (e) {}
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const keyType = process.env.SUPABASE_SERVICE_ROLE_KEY ? "service_role" : "anon";
console.log(`Using ${keyType} key`);
console.log(`URL: ${supabaseUrl}`);
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  // Check for paid daily_attendance records without settlement_group
  console.log("--- Daily Attendance: Paid but no settlement_group ---");
  const { data: dailyOrphans, error: de } = await supabase
    .from("daily_attendance")
    .select("id, site_id, date, is_paid, settlement_group_id, daily_earnings")
    .eq("is_paid", true)
    .is("settlement_group_id", null)
    .limit(20);

  if (de) console.log("Error:", de.message);
  console.log(`Found: ${dailyOrphans?.length || 0} records`);
  dailyOrphans?.forEach(r => {
    console.log(`  ${r.date} - ₹${r.daily_earnings} - site: ${r.site_id}`);
  });

  // Check for paid market_laborer_attendance records without settlement_group
  console.log("\n--- Market Attendance: Paid but no settlement_group ---");
  const { data: marketOrphans, error: me } = await supabase
    .from("market_laborer_attendance")
    .select("id, site_id, date, is_paid, settlement_group_id, total_cost")
    .eq("is_paid", true)
    .is("settlement_group_id", null)
    .limit(20);

  if (me) console.log("Error:", me.message);
  console.log(`Found: ${marketOrphans?.length || 0} records`);
  marketOrphans?.forEach(r => {
    console.log(`  ${r.date} - ₹${r.total_cost} - site: ${r.site_id}`);
  });

  // First get all settlement_groups (any creator, not cancelled)
  console.log("\n--- Getting all non-cancelled settlement_groups ---");
  const { data: sgList, error: sgError } = await supabase
    .from("settlement_groups")
    .select("*")
    .eq("is_cancelled", false)
    .order("created_at", { ascending: false })
    .limit(50);

  if (sgError) {
    console.log("Error fetching settlements:", sgError.message);
  }

  console.log(`Found ${sgList?.length || 0} System Migration records`);

  // Get the first one to get site_id
  const sg = sgList?.find(s => s.settlement_reference === "SET-202512-048");
  const siteId = sg?.site_id;
  console.log(`\nSET-202512-048:`, sg);
  console.log(`Site ID: ${siteId}`);

  // Also list all of them
  console.log("\n--- All System Migration settlement_groups ---");
  sgList?.forEach(s => {
    console.log(`  ${s.settlement_reference} - Date: ${s.settlement_date} - Amount: ₹${s.total_amount} - Cancelled: ${s.is_cancelled}`);
  });

  // Check attendance on those dates (only if we have a siteId)
  if (siteId) {
    console.log("\n--- Checking attendance for orphaned settlement dates ---");

    // Get the orphaned settlement_group IDs
    const orphanedRefs = ["SET-202512-048", "SET-202512-043", "SET-202512-041", "SET-202511-008"];
    const orphanedIds = orphanedRefs.map(ref => sgList?.find(s => s.settlement_reference === ref)?.id).filter(Boolean);
    console.log(`Orphaned settlement IDs: ${orphanedIds.join(", ")}`);

    for (const d of ["2025-12-22", "2025-12-14", "2025-12-04", "2025-11-23"]) {
      const { data: dailyOnDate } = await supabase
        .from("daily_attendance")
        .select("id, date, is_paid, settlement_group_id, daily_earnings")
        .eq("site_id", siteId)
        .eq("date", d);

      const { data: marketOnDate } = await supabase
        .from("market_laborer_attendance")
        .select("id, date, is_paid, settlement_group_id, total_cost")
        .eq("site_id", siteId)
        .eq("date", d);

      console.log(`\n  Date ${d}:`);
      console.log(`    Daily: ${dailyOnDate?.length || 0} records`);

      // Check which settlement_group they're linked to
      const settlementIds = [...new Set(dailyOnDate?.map(r => r.settlement_group_id).filter(Boolean) || [])];
      for (const sgId of settlementIds) {
        const linkedSg = sgList?.find(s => s.id === sgId);
        const isOrphaned = orphanedIds.includes(sgId);
        console.log(`      -> Linked to: ${linkedSg?.settlement_reference || "unknown"} ${isOrphaned ? "(ORPHANED!)" : ""}`);
      }

      // Sum amounts
      const dailyTotal = dailyOnDate?.reduce((s, r) => s + (r.daily_earnings || 0), 0) || 0;
      const marketTotal = marketOnDate?.reduce((s, r) => s + (r.total_cost || 0), 0) || 0;
      console.log(`    Total daily earnings: ₹${dailyTotal.toLocaleString("en-IN")}`);
      console.log(`    Market: ${marketOnDate?.length || 0} records, Total: ₹${marketTotal.toLocaleString("en-IN")}`);
    }
  } else {
    console.log("\n--- Skipping date checks (no siteId found) ---");
  }

  // Also check ALL daily_attendance for this site to see what dates have data
  if (siteId) {
    console.log("\n--- All daily_attendance dates for this site ---");
    const { data: allDaily } = await supabase
      .from("daily_attendance")
      .select("date, is_paid, settlement_group_id")
      .eq("site_id", siteId)
      .order("date", { ascending: false })
      .limit(30);

    const dateGroups = {};
    allDaily?.forEach(r => {
      if (!dateGroups[r.date]) dateGroups[r.date] = { total: 0, paid: 0, hasSettlement: 0 };
      dateGroups[r.date].total++;
      if (r.is_paid) dateGroups[r.date].paid++;
      if (r.settlement_group_id) dateGroups[r.date].hasSettlement++;
    });

    Object.entries(dateGroups).slice(0, 15).forEach(([date, stats]) => {
      console.log(`  ${date}: ${stats.total} total, ${stats.paid} paid, ${stats.hasSettlement} with settlement`);
    });
  }
}

check();
