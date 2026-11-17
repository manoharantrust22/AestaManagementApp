#!/usr/bin/env node
/*
  Audit payment discrepancy between labor_payments and settlement_groups

  Usage:
    node scripts/audit-payment-discrepancy.mjs --site "SiteName"
*/
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local file
function loadEnvLocal() {
  try {
    const envPath = resolve(__dirname, "..", ".env.local");
    const content = readFileSync(envPath, "utf-8");
    content.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        const value = valueParts.join("=");
        if (key && value && !process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  } catch (e) {
    // Ignore if file doesn't exist
  }
}

loadEnvLocal();

function getArg(name, def = undefined) {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return def;
}

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function fmt(n) {
  return `Rs.${(n || 0).toLocaleString()}`;
}

async function resolveSiteId(siteNameArg) {
  if (!siteNameArg) {
    // List all sites
    const { data } = await supabase.from("sites").select("id, name");
    console.log("\nAvailable sites:");
    (data || []).forEach((s) => console.log(`  - ${s.name} (${s.id})`));
    throw new Error("Provide --site <name pattern> to select a site.");
  }
  const { data, error } = await supabase
    .from("sites")
    .select("id, name")
    .ilike("name", `%${siteNameArg}%`);
  if (error) throw error;
  if (!data || data.length === 0)
    throw new Error(`No site found matching '${siteNameArg}'.`);
  const site = data[0];
  console.log(`\nUsing site: ${site.name} (${site.id})`);
  return site.id;
}

async function main() {
  const siteId = await resolveSiteId(getArg("site"));

  console.log("\n" + "=".repeat(60));
  console.log("PAYMENT DISCREPANCY AUDIT");
  console.log("=".repeat(60));

  // 1. Get all contract labor_payments
  const { data: laborPayments } = await supabase
    .from("labor_payments")
    .select("id, amount, settlement_group_id, payment_reference, laborer_id")
    .eq("site_id", siteId)
    .eq("is_under_contract", true);

  const totalFromLaborPayments = (laborPayments || []).reduce(
    (sum, p) => sum + (p.amount || 0),
    0
  );
  const orphanPayments = (laborPayments || []).filter(
    (p) => !p.settlement_group_id
  );
  const orphanTotal = orphanPayments.reduce(
    (sum, p) => sum + (p.amount || 0),
    0
  );

  console.log("\n--- Labor Payments (contract) ---");
  console.log(`Total labor_payments count: ${(laborPayments || []).length}`);
  console.log(`Total from labor_payments: ${fmt(totalFromLaborPayments)}`);
  console.log(`Payments WITHOUT settlement_group_id: ${orphanPayments.length}`);
  console.log(`Orphan payments total: ${fmt(orphanTotal)}`);

  // 2. Get settlement_group_ids from contract payments
  const sgIds = [
    ...new Set(
      (laborPayments || [])
        .filter((p) => p.settlement_group_id)
        .map((p) => p.settlement_group_id)
    ),
  ];

  // 3. Get settlement_groups (including cancelled for analysis)
  let settlementGroups = [];
  let cancelledSettlementGroups = [];
  if (sgIds.length > 0) {
    const { data } = await supabase
      .from("settlement_groups")
      .select("id, settlement_reference, total_amount, payment_type, is_cancelled")
      .eq("site_id", siteId)
      .eq("is_cancelled", false)
      .in("id", sgIds);
    settlementGroups = data || [];

    // Also get cancelled ones
    const { data: cancelled } = await supabase
      .from("settlement_groups")
      .select("id, settlement_reference, total_amount, payment_type, is_cancelled")
      .eq("site_id", siteId)
      .eq("is_cancelled", true)
      .in("id", sgIds);
    cancelledSettlementGroups = cancelled || [];
  }

  const salarySettlements = settlementGroups.filter(
    (sg) => sg.payment_type !== "advance"
  );
  const advanceSettlements = settlementGroups.filter(
    (sg) => sg.payment_type === "advance"
  );

  const salaryTotal = salarySettlements.reduce(
    (sum, sg) => sum + (sg.total_amount || 0),
    0
  );
  const advanceTotal = advanceSettlements.reduce(
    (sum, sg) => sum + (sg.total_amount || 0),
    0
  );
  const settlementTotal = salaryTotal + advanceTotal;

  console.log("\n--- Settlement Groups ---");
  console.log(`Salary settlements: ${salarySettlements.length} = ${fmt(salaryTotal)}`);
  console.log(`Advance settlements: ${advanceSettlements.length} = ${fmt(advanceTotal)}`);
  console.log(`Total from settlement_groups: ${fmt(settlementTotal)}`);

  // Show cancelled settlements
  const cancelledTotal = cancelledSettlementGroups.reduce(
    (sum, sg) => sum + (sg.total_amount || 0),
    0
  );
  if (cancelledSettlementGroups.length > 0) {
    console.log(`\n--- CANCELLED Settlement Groups (still have labor_payments!) ---`);
    console.log(`Count: ${cancelledSettlementGroups.length} = ${fmt(cancelledTotal)}`);
    cancelledSettlementGroups.forEach((sg) => {
      console.log(`  ${sg.settlement_reference} | ${fmt(sg.total_amount)} | ${sg.payment_type}`);
    });
  }

  // 4. Calculate discrepancy
  const discrepancy = totalFromLaborPayments - settlementTotal;

  console.log("\n--- DISCREPANCY ANALYSIS ---");
  console.log(`labor_payments total:     ${fmt(totalFromLaborPayments)}`);
  console.log(`settlement_groups total:  ${fmt(settlementTotal)}`);
  console.log(`DISCREPANCY:              ${fmt(discrepancy)}`);
  console.log(`Orphan payments total:    ${fmt(orphanTotal)}`);

  if (Math.abs(discrepancy - orphanTotal) < 1) {
    console.log(
      "\n*** Discrepancy matches orphan payments! These payments have no settlement_group. ***"
    );
  }

  // 5. Show orphan payments
  if (orphanPayments.length > 0) {
    console.log("\n--- Orphan Payments (no settlement_group_id) ---");

    // Get laborer names
    const laborerIds = [...new Set(orphanPayments.map((p) => p.laborer_id))];
    const { data: laborers } = await supabase
      .from("laborers")
      .select("id, name")
      .in("id", laborerIds);
    const laborerMap = new Map((laborers || []).map((l) => [l.id, l.name]));

    orphanPayments.forEach((p) => {
      console.log(
        `  ${p.payment_reference || "NO-REF"} | ${laborerMap.get(p.laborer_id) || "Unknown"} | ${fmt(p.amount)}`
      );
    });
  }

  // 6. Check for non-rounded amounts
  const nonRoundedPayments = (laborPayments || []).filter(
    (p) => (p.amount || 0) % 100 !== 0
  );

  console.log("\n--- Non-Rounded Amounts (not divisible by 100) ---");
  console.log(`Count: ${nonRoundedPayments.length}`);

  if (nonRoundedPayments.length > 0 && nonRoundedPayments.length <= 20) {
    // Get laborer names
    const laborerIds = [...new Set(nonRoundedPayments.map((p) => p.laborer_id))];
    const { data: laborers } = await supabase
      .from("laborers")
      .select("id, name")
      .in("id", laborerIds);
    const laborerMap = new Map((laborers || []).map((l) => [l.id, l.name]));

    nonRoundedPayments.forEach((p) => {
      console.log(
        `  ${p.payment_reference || "NO-REF"} | ${laborerMap.get(p.laborer_id) || "Unknown"} | ${fmt(p.amount)}`
      );
    });
  } else if (nonRoundedPayments.length > 20) {
    console.log(`  (showing first 10 only)`);
    const laborerIds = [...new Set(nonRoundedPayments.slice(0, 10).map((p) => p.laborer_id))];
    const { data: laborers } = await supabase
      .from("laborers")
      .select("id, name")
      .in("id", laborerIds);
    const laborerMap = new Map((laborers || []).map((l) => [l.id, l.name]));

    nonRoundedPayments.slice(0, 10).forEach((p) => {
      console.log(
        `  ${p.payment_reference || "NO-REF"} | ${laborerMap.get(p.laborer_id) || "Unknown"} | ${fmt(p.amount)}`
      );
    });
  }

  // 7. Check for settlement_groups where sum of labor_payments doesn't match
  console.log("\n--- Settlement Groups with Mismatched Totals ---");
  let mismatchCount = 0;

  for (const sg of settlementGroups) {
    const paymentsForSg = (laborPayments || []).filter(
      (p) => p.settlement_group_id === sg.id
    );
    const paymentsSum = paymentsForSg.reduce((sum, p) => sum + (p.amount || 0), 0);
    const diff = Math.abs(sg.total_amount - paymentsSum);

    if (diff > 0.01) {
      mismatchCount++;
      if (mismatchCount <= 10) {
        console.log(
          `  ${sg.settlement_reference}: SG=${fmt(sg.total_amount)} vs LP=${fmt(paymentsSum)} (diff: ${fmt(diff)})`
        );
      }
    }
  }

  if (mismatchCount === 0) {
    console.log("  None - all settlement_groups match their labor_payments sum.");
  } else if (mismatchCount > 10) {
    console.log(`  ... and ${mismatchCount - 10} more`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`UI Summary Card should show: ${fmt(salaryTotal)} (Salary) + ${fmt(advanceTotal)} (Advances) = ${fmt(settlementTotal)}`);
  console.log(`If table shows ${fmt(totalFromLaborPayments)}, the difference is ${fmt(discrepancy)}`);
  if (orphanTotal > 0) {
    console.log(`\nFIX NEEDED: ${orphanPayments.length} labor_payments lack settlement_group_id (total: ${fmt(orphanTotal)})`);
  }
  if (nonRoundedPayments.length > 0) {
    console.log(`\nFIX NEEDED: ${nonRoundedPayments.length} payments have non-rounded amounts`);
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
