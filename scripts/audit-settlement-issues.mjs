/**
 * Audit Script: Analyze Settlement Issues
 * Run this BEFORE and AFTER migration to compare results
 *
 * Usage:
 *   node scripts/audit-settlement-issues.mjs
 *
 * Set LOCAL=true to connect to local Supabase:
 *   LOCAL=true node scripts/audit-settlement-issues.mjs
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

// Prefer service role key for full access, fall back to anon key
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
console.log("SETTLEMENT ISSUES AUDIT REPORT");
console.log(`Environment: ${isLocal ? "LOCAL" : "PRODUCTION"}`);
console.log(`API Key Type: ${keyType}`);
console.log(`Timestamp: ${new Date().toISOString()}`);
console.log("============================================================\n");

async function runAudit() {
  try {
    // 1. Count settlement_groups by subcontract status
    console.log("--- 1. Settlement Groups by Subcontract Status ---");
    const { data: sgSubcontractStatus } = await supabase
      .from("settlement_groups")
      .select("id, subcontract_id")
      .eq("is_cancelled", false);

    const linked = sgSubcontractStatus?.filter((sg) => sg.subcontract_id !== null).length || 0;
    const unlinked = sgSubcontractStatus?.filter((sg) => sg.subcontract_id === null).length || 0;
    console.log(`  Linked to Subcontract: ${linked}`);
    console.log(`  Unlinked (NULL): ${unlinked}`);
    console.log(`  Total: ${linked + unlinked}\n`);

    // 2. Settlement groups by creator
    console.log("--- 2. Settlement Groups by Creator ---");
    const { data: sgByCreator } = await supabase
      .from("settlement_groups")
      .select("created_by_name, subcontract_id")
      .eq("is_cancelled", false);

    const creatorStats = {};
    sgByCreator?.forEach((sg) => {
      const creator = sg.created_by_name || "Unknown";
      if (!creatorStats[creator]) {
        creatorStats[creator] = { total: 0, unlinked: 0 };
      }
      creatorStats[creator].total++;
      if (sg.subcontract_id === null) {
        creatorStats[creator].unlinked++;
      }
    });

    Object.entries(creatorStats)
      .sort((a, b) => b[1].total - a[1].total)
      .forEach(([creator, stats]) => {
        console.log(`  ${creator}: ${stats.total} total, ${stats.unlinked} unlinked`);
      });
    console.log("");

    // 3. Dates with duplicate settlement_groups
    console.log("--- 3. Dates with DUPLICATE Settlement Groups ---");
    const { data: allSg } = await supabase
      .from("settlement_groups")
      .select("site_id, settlement_date, settlement_reference, payment_type")
      .eq("is_cancelled", false);

    const dateGroups = {};
    allSg?.forEach((sg) => {
      // Exclude advances and other
      if (sg.payment_type === "advance" || sg.payment_type === "other") return;

      const key = `${sg.site_id}_${sg.settlement_date}`;
      if (!dateGroups[key]) {
        dateGroups[key] = [];
      }
      dateGroups[key].push(sg.settlement_reference);
    });

    const duplicates = Object.entries(dateGroups)
      .filter(([_, refs]) => refs.length > 1)
      .sort((a, b) => b[1].length - a[1].length);

    if (duplicates.length === 0) {
      console.log("  No duplicate settlement_groups found");
    } else {
      console.log(`  Found ${duplicates.length} date(s) with duplicates:`);
      duplicates.slice(0, 10).forEach(([key, refs]) => {
        const [siteId, date] = key.split("_");
        console.log(`    ${date}: ${refs.length} groups (${refs.join(", ")})`);
      });
      if (duplicates.length > 10) {
        console.log(`    ... and ${duplicates.length - 10} more`);
      }
    }
    console.log("");

    // 4. Daily attendance subcontract status
    console.log("--- 4. Daily Attendance Subcontract Status ---");
    const { data: dailyAtt } = await supabase
      .from("daily_attendance")
      .select("id, subcontract_id")
      .eq("is_paid", true);

    const dailyLinked = dailyAtt?.filter((a) => a.subcontract_id !== null).length || 0;
    const dailyUnlinked = dailyAtt?.filter((a) => a.subcontract_id === null).length || 0;
    console.log(`  Linked: ${dailyLinked}`);
    console.log(`  Unlinked: ${dailyUnlinked}`);
    console.log(`  Total: ${dailyLinked + dailyUnlinked}\n`);

    // 5. Market attendance subcontract status
    console.log("--- 5. Market Attendance Subcontract Status ---");
    const { data: marketAtt } = await supabase
      .from("market_laborer_attendance")
      .select("id, subcontract_id")
      .eq("is_paid", true);

    const marketLinked = marketAtt?.filter((a) => a.subcontract_id !== null).length || 0;
    const marketUnlinked = marketAtt?.filter((a) => a.subcontract_id === null).length || 0;
    console.log(`  Linked: ${marketLinked}`);
    console.log(`  Unlinked: ${marketUnlinked}`);
    console.log(`  Total: ${marketLinked + marketUnlinked}\n`);

    // 6. Expense records by type
    console.log("--- 6. Expense Records by Type (from v_all_expenses) ---");
    const { data: expenses } = await supabase
      .from("v_all_expenses")
      .select("expense_type, contract_id")
      .eq("is_deleted", false);

    const expenseStats = {};
    expenses?.forEach((e) => {
      const type = e.expense_type || "Unknown";
      if (!expenseStats[type]) {
        expenseStats[type] = { total: 0, unlinked: 0 };
      }
      expenseStats[type].total++;
      if (e.contract_id === null) {
        expenseStats[type].unlinked++;
      }
    });

    Object.entries(expenseStats)
      .sort((a, b) => b[1].total - a[1].total)
      .forEach(([type, stats]) => {
        console.log(`  ${type}: ${stats.total} total, ${stats.unlinked} unlinked`);
      });
    console.log("");

    console.log("============================================================");
    console.log("END OF AUDIT REPORT");
    console.log("============================================================");

  } catch (error) {
    console.error("Error running audit:", error);
    process.exit(1);
  }
}

runAudit();
