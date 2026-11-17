/**
 * Audit Script: Find Orphaned Settlement Groups
 * Identifies settlement_groups records that have no linked labor_payments
 * These show as "Daily Salary" in expenses but don't appear in salary payments page
 *
 * Usage:
 *   node scripts/audit-orphaned-settlements.mjs
 *
 * Set LOCAL=true to connect to local Supabase:
 *   LOCAL=true node scripts/audit-orphaned-settlements.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local manually
function loadEnvFile(filePath) {
  try {
    const content = readFileSync(filePath, "utf-8");
    content.split("\n").forEach((line) => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  } catch (e) {
    // File not found, continue with existing env
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

// Determine if using local or production
const isLocal = process.env.LOCAL === "true";

const supabaseUrl = isLocal
  ? "http://localhost:54321"
  : process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseKey = isLocal
  ? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
  : process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const keyType = process.env.SUPABASE_SERVICE_ROLE_KEY ? "service_role" : "anon";

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials. Check your .env.local file.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log("============================================================");
console.log("ORPHANED SETTLEMENT GROUPS AUDIT");
console.log(`Environment: ${isLocal ? "LOCAL" : "PRODUCTION"}`);
console.log(`API Key Type: ${keyType}`);
console.log(`Timestamp: ${new Date().toISOString()}`);
console.log("============================================================\n");

async function runAudit() {
  try {
    // 1. Get all non-cancelled settlement_groups
    console.log("--- Fetching settlement_groups... ---\n");
    const { data: settlements, error: sgError } = await supabase
      .from("settlement_groups")
      .select(`
        id,
        settlement_reference,
        settlement_date,
        total_amount,
        laborer_count,
        payment_type,
        site_id,
        subcontract_id,
        created_at,
        created_by_name
      `)
      .eq("is_cancelled", false)
      .order("settlement_date", { ascending: false });

    if (sgError) throw sgError;

    // 2. Get all labor_payments grouped by settlement_group_id
    const { data: laborPayments, error: lpError } = await supabase
      .from("labor_payments")
      .select("settlement_group_id, is_under_contract");

    if (lpError) throw lpError;

    // Create a map of settlement_group_id -> count of labor_payments
    const paymentCounts = {};
    const contractPaymentCounts = {};
    laborPayments?.forEach((lp) => {
      if (lp.settlement_group_id) {
        paymentCounts[lp.settlement_group_id] = (paymentCounts[lp.settlement_group_id] || 0) + 1;
        if (lp.is_under_contract) {
          contractPaymentCounts[lp.settlement_group_id] = (contractPaymentCounts[lp.settlement_group_id] || 0) + 1;
        }
      }
    });

    // 3. Get site names
    const { data: sites } = await supabase.from("sites").select("id, name");
    const siteMap = {};
    sites?.forEach((s) => { siteMap[s.id] = s.name; });

    // 4. Find orphaned settlement_groups (no linked labor_payments)
    const orphaned = settlements?.filter((sg) => !paymentCounts[sg.id]) || [];

    console.log("--- SUMMARY ---");
    console.log(`Total settlement_groups (non-cancelled): ${settlements?.length || 0}`);
    console.log(`Settlement_groups WITH labor_payments: ${settlements?.length - orphaned.length}`);
    console.log(`Settlement_groups WITHOUT labor_payments (ORPHANED): ${orphaned.length}`);
    console.log("");

    if (orphaned.length === 0) {
      console.log("✅ No orphaned settlement_groups found!");
    } else {
      console.log("--- ORPHANED SETTLEMENT GROUPS (No linked labor_payments) ---\n");
      console.log("These records show as 'Daily Salary' in expenses but have no actual payments:\n");

      // Group by site
      const bySite = {};
      orphaned.forEach((sg) => {
        const siteName = siteMap[sg.site_id] || "Unknown Site";
        if (!bySite[siteName]) bySite[siteName] = [];
        bySite[siteName].push(sg);
      });

      let totalAmount = 0;
      Object.entries(bySite)
        .sort((a, b) => b[1].length - a[1].length)
        .forEach(([siteName, records]) => {
          console.log(`\n📍 ${siteName} (${records.length} orphaned records):`);
          console.log("-".repeat(80));

          records.forEach((sg) => {
            totalAmount += sg.total_amount || 0;
            console.log(`  ${sg.settlement_reference || "NO-REF"}`);
            console.log(`    Date: ${sg.settlement_date}`);
            console.log(`    Amount: ₹${(sg.total_amount || 0).toLocaleString("en-IN")}`);
            console.log(`    Laborer Count: ${sg.laborer_count}`);
            console.log(`    Payment Type: ${sg.payment_type}`);
            console.log(`    Created By: ${sg.created_by_name || "Unknown"}`);
            console.log(`    Created At: ${sg.created_at}`);
            console.log("");
          });
        });

      console.log("============================================================");
      console.log(`TOTAL ORPHANED AMOUNT: ₹${totalAmount.toLocaleString("en-IN")}`);
      console.log("============================================================\n");

      // 5. Also check for settlement_groups that have labor_payments but all are contract (no daily)
      console.log("--- SETTLEMENT GROUPS WITH ONLY CONTRACT PAYMENTS ---\n");
      console.log("These have labor_payments but all are is_under_contract=true:");
      console.log("(Currently showing as 'Contract Salary' correctly)\n");

      const contractOnly = settlements?.filter((sg) => {
        const total = paymentCounts[sg.id] || 0;
        const contract = contractPaymentCounts[sg.id] || 0;
        return total > 0 && total === contract;
      }) || [];

      console.log(`Found ${contractOnly.length} settlement_groups with only contract payments\n`);

      // 6. Check for potential expense_type mismatches
      console.log("--- CHECKING expense_type LOGIC ---\n");

      const dailyOnlySettlements = settlements?.filter((sg) => {
        const total = paymentCounts[sg.id] || 0;
        const contract = contractPaymentCounts[sg.id] || 0;
        // Has payments, but none are contract
        return total > 0 && contract === 0 && sg.payment_type !== "advance";
      }) || [];

      console.log(`Settlement_groups that should show as 'Daily Salary': ${dailyOnlySettlements.length}`);
      console.log(`Settlement_groups that should show as 'Contract Salary': ${contractOnly.length}`);
      console.log(`Settlement_groups that are orphaned (defaulting to 'Daily Salary'): ${orphaned.length}`);
    }

    console.log("\n============================================================");
    console.log("END OF AUDIT REPORT");
    console.log("============================================================");

  } catch (error) {
    console.error("Error running audit:", error);
    process.exit(1);
  }
}

runAudit();
