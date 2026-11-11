/**
 * Script to link restored settlements to their subcontracts
 *
 * This script:
 * 1. Finds the subcontract "House Construction on Srinivasan Site"
 * 2. Updates all restored settlement_groups to link to that subcontract
 * 3. Updates associated attendance records as well
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

async function linkSettlementsToSubcontracts() {
  console.log("=== LINKING RESTORED SETTLEMENTS TO SUBCONTRACTS ===\n");

  // Step 1: Find the subcontract
  const { data: subcontracts, error: scErr } = await supabase
    .from("subcontracts")
    .select("id, title, site_id")
    .ilike("title", "%House Construction%Srinivasan%");

  if (scErr) {
    console.error("Error finding subcontract:", scErr.message);
    return;
  }

  if (!subcontracts || subcontracts.length === 0) {
    console.log("No matching subcontract found. Let me list all subcontracts...");

    const { data: allSc } = await supabase
      .from("subcontracts")
      .select("id, title, site_id")
      .limit(10);

    console.log("Available subcontracts:");
    allSc?.forEach(sc => console.log(`  - ${sc.title} (${sc.id})`));
    return;
  }

  const subcontract = subcontracts[0];
  console.log(`Found subcontract: "${subcontract.title}" (${subcontract.id})`);
  console.log(`Site ID: ${subcontract.site_id}`);

  // Step 2: Find all restored settlement_groups (those without subcontract_id or with "System Recovery" marker)
  const { data: settlementGroups, error: sgErr } = await supabase
    .from("settlement_groups")
    .select("id, settlement_reference, total_amount, created_by_name, subcontract_id")
    .eq("site_id", subcontract.site_id)
    .eq("is_cancelled", false);

  if (sgErr) {
    console.error("Error fetching settlement groups:", sgErr.message);
    return;
  }

  console.log(`\nFound ${settlementGroups?.length || 0} settlement groups for this site`);

  // Filter to only those that need linking (no subcontract_id or restored ones)
  const toLink = settlementGroups?.filter(sg =>
    !sg.subcontract_id || sg.created_by_name?.includes("System Recovery")
  ) || [];

  console.log(`Settlements needing subcontract link: ${toLink.length}`);

  if (toLink.length === 0) {
    console.log("All settlements are already linked. Nothing to do.");
    return;
  }

  // Step 3: Update settlement_groups with subcontract_id
  let updatedCount = 0;
  let errorCount = 0;

  for (const sg of toLink) {
    const { error: updateErr } = await (supabase as any)
      .from("settlement_groups")
      .update({ subcontract_id: subcontract.id })
      .eq("id", sg.id);

    if (updateErr) {
      console.error(`  Error updating ${sg.settlement_reference}:`, updateErr.message);
      errorCount++;
    } else {
      console.log(`  ✓ Linked ${sg.settlement_reference} (Rs.${sg.total_amount}) to subcontract`);
      updatedCount++;
    }
  }

  // Step 4: Update daily_attendance records to have the subcontract_id
  console.log("\nUpdating daily_attendance records...");

  const { data: dailyAttendance, error: daErr } = await supabase
    .from("daily_attendance")
    .select("id, settlement_group_id")
    .eq("site_id", subcontract.site_id)
    .eq("is_paid", true)
    .is("subcontract_id", null);

  if (daErr) {
    console.error("Error fetching daily attendance:", daErr.message);
  } else {
    const daToUpdate = dailyAttendance?.filter(da =>
      toLink.some(sg => sg.id === da.settlement_group_id)
    ) || [];

    if (daToUpdate.length > 0) {
      const daIds = daToUpdate.map(da => da.id);
      const { error: daBatchErr } = await supabase
        .from("daily_attendance")
        .update({ subcontract_id: subcontract.id })
        .in("id", daIds);

      if (daBatchErr) {
        console.error("Error updating daily_attendance:", daBatchErr.message);
      } else {
        console.log(`  ✓ Updated ${daToUpdate.length} daily attendance records`);
      }
    } else {
      console.log("  No daily attendance records need updating");
    }
  }

  // Step 5: Update market_laborer_attendance records
  console.log("\nUpdating market_laborer_attendance records...");

  const { data: marketAttendance, error: maErr } = await supabase
    .from("market_laborer_attendance")
    .select("id, settlement_group_id")
    .eq("site_id", subcontract.site_id)
    .eq("is_paid", true)
    .is("subcontract_id", null);

  if (maErr) {
    console.error("Error fetching market attendance:", maErr.message);
  } else {
    const maToUpdate = marketAttendance?.filter(ma =>
      toLink.some(sg => sg.id === ma.settlement_group_id)
    ) || [];

    if (maToUpdate.length > 0) {
      const maIds = maToUpdate.map(ma => ma.id);
      const { error: maBatchErr } = await supabase
        .from("market_laborer_attendance")
        .update({ subcontract_id: subcontract.id })
        .in("id", maIds);

      if (maBatchErr) {
        console.error("Error updating market_laborer_attendance:", maBatchErr.message);
      } else {
        console.log(`  ✓ Updated ${maToUpdate.length} market attendance records`);
      }
    } else {
      console.log("  No market attendance records need updating");
    }
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Settlement groups linked: ${updatedCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`\nThe 'Unlinked' status should now show the subcontract name.`);
}

// Run the script
linkSettlementsToSubcontracts().catch(console.error);
