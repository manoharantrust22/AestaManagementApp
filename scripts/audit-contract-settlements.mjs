#!/usr/bin/env node
/*
  Audit contract settlements:
  - Finds site by name (pattern) or uses --site-id
  - Lists non-rounded settlement groups and labor payments
  - Computes salary-only settlements and advances totals in range

  Usage (PowerShell on Windows):
    $env:SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
    $env:SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
    node scripts/audit-contract-settlements.mjs --site "Srinivasan" --from 2025-11-01 --to 2025-12-31
    # Or:
    node scripts/audit-contract-settlements.mjs --site-id YOUR_SITE_ID --from 2025-11-01 --to 2025-12-31
*/
import { createClient } from "@supabase/supabase-js";

function getArg(name, def = undefined) {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return def;
}

// Support both server-only and NEXT_PUBLIC env names
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

async function resolveSiteId(siteIdArg, siteNameArg) {
  if (siteIdArg) return siteIdArg;
  if (!siteNameArg)
    throw new Error("Provide --site-id or --site <name pattern>.");
  // Try to match by title or name
  const { data, error } = await supabase
    .from("sites")
    .select("id, title, name")
    .ilike("title", `%${siteNameArg}%`);
  if (error) throw error;
  if (!data || data.length === 0)
    throw new Error(`No site found matching '${siteNameArg}'.`);
  const site = data[0];
  console.log(`Using site: ${site.title || site.name} (${site.id})`);
  return site.id;
}

function fmt(n) {
  return `₹${(n || 0).toLocaleString()}`;
}

async function main() {
  const siteId = await resolveSiteId(getArg("site-id"), getArg("site"));
  const from = getArg("from", "2000-01-01");
  const to = getArg("to", new Date().toISOString().slice(0, 10));

  // Fetch settlement groups used by contract payments in range
  const { data: paymentSgIds } = await supabase
    .from("labor_payments")
    .select("settlement_group_id")
    .eq("site_id", siteId)
    .eq("is_under_contract", true)
    .not("settlement_group_id", "is", null);
  const sgIds = [
    ...new Set((paymentSgIds || []).map((p) => p.settlement_group_id)),
  ];

  const { data: sgs } = await supabase
    .from("settlement_groups")
    .select(
      "id, settlement_reference, settlement_date, total_amount, payment_type, is_cancelled"
    )
    .eq("site_id", siteId)
    .eq("is_cancelled", false)
    .gte("settlement_date", from)
    .lte("settlement_date", to)
    .in("id", sgIds.length ? sgIds : ["00000000-0000-0000-0000-000000000000"]); // guard when none

  const nonRoundedSgs = (sgs || []).filter(
    (sg) => (sg.total_amount || 0) % 100 !== 0
  );
  const salarySgs = (sgs || []).filter((sg) => sg.payment_type !== "advance");
  const advanceSgs = (sgs || []).filter((sg) => sg.payment_type === "advance");

  const salaryTotal = salarySgs.reduce((s, r) => s + (r.total_amount || 0), 0);
  const advancesTotal = advanceSgs.reduce(
    (s, r) => s + (r.total_amount || 0),
    0
  );

  const { data: nonRoundedLp } = await supabase
    .from("labor_payments")
    .select(
      "id, payment_reference, actual_payment_date, amount, settlement_group_id"
    )
    .eq("site_id", siteId)
    .eq("is_under_contract", true)
    .gte("actual_payment_date", from)
    .lte("actual_payment_date", to);
  const laborPaymentsOdd = (nonRoundedLp || []).filter(
    (lp) => (lp.amount || 0) % 100 !== 0
  );

  console.log("\n=== Audit Window ===");
  console.log(`Site: ${siteId}`);
  console.log(`From: ${from}  To: ${to}`);

  console.log("\n=== Salary Settlements (should match table Paid sum) ===");
  console.log(`Count: ${salarySgs.length}`);
  console.log(`Total: ${fmt(salaryTotal)}`);

  console.log("\n=== Advances (separate, shown in dashboard) ===");
  console.log(`Count: ${advanceSgs.length}`);
  console.log(`Total: ${fmt(advancesTotal)}`);

  console.log("\n=== Non-rounded settlement_groups ===");
  if (nonRoundedSgs.length === 0) console.log("None");
  else
    nonRoundedSgs.forEach((sg) =>
      console.log(
        `${sg.settlement_reference}  ${sg.settlement_date}  ${fmt(
          sg.total_amount
        )}  (${sg.payment_type})`
      )
    );

  console.log("\n=== Non-rounded labor_payments (contract) ===");
  if (laborPaymentsOdd.length === 0) console.log("None");
  else
    laborPaymentsOdd.forEach((lp) =>
      console.log(
        `${lp.payment_reference}  ${lp.actual_payment_date}  ${fmt(
          lp.amount
        )}  SG:${lp.settlement_group_id}`
      )
    );

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
