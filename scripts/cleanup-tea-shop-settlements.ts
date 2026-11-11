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

async function cleanupTeaShopSettlements() {
  console.log("=== CLEANING UP TEA SHOP SETTLEMENTS ===\n");

  // Step 1: Find site ID for "Srinivasan House & Shop"
  console.log("Step 1: Finding site...");
  const { data: sites, error: sitesError } = await supabase
    .from("sites")
    .select("id, name, site_group_id")
    .ilike("name", "%Srinivasan%");

  if (sitesError) {
    console.error("Error finding site:", sitesError.message);
    return;
  }

  if (!sites || sites.length === 0) {
    console.log("No site found matching 'Srinivasan'");
    return;
  }

  console.log("Found sites:", sites);
  const site = sites[0];
  const siteId = site.id;
  const siteGroupId = site.site_group_id;
  console.log(`Using site: ${site.name} (ID: ${siteId})`);
  console.log(`Site group ID: ${siteGroupId || "None"}\n`);

  // Step 2: Find tea_shop_accounts for this site
  console.log("Step 2: Finding tea shop accounts...");
  const { data: shops, error: shopsError } = await supabase
    .from("tea_shop_accounts")
    .select("id, site_id, owner_name")
    .eq("site_id", siteId);

  if (shopsError) {
    console.error("Error finding tea shop accounts:", shopsError.message);
    return;
  }

  console.log("Found tea shop accounts:", shops?.length || 0);
  if (shops && shops.length > 0) {
    shops.forEach((s: any) => console.log(`  Shop ID: ${s.id} | Owner: ${s.owner_name}`));
  }

  const shopIds = shops?.map((s: any) => s.id) || [];

  // Step 3: Check current settlements
  console.log("\nStep 3: Checking existing settlements...");
  const { data: settlements, error: settlementsError } = await supabase
    .from("tea_shop_settlements")
    .select("id, tea_shop_id, amount_paid, payment_date, settlement_reference")
    .in("tea_shop_id", shopIds.length > 0 ? shopIds : ["no-match"]);

  if (settlementsError) {
    console.error("Error finding settlements:", settlementsError.message);
  } else {
    console.log("Found settlements:", settlements?.length || 0);
    if (settlements && settlements.length > 0) {
      let total = 0;
      settlements.forEach((s: any) => {
        console.log(`  ${s.settlement_reference || s.id} | Amount: ₹${s.amount_paid} | Date: ${s.payment_date}`);
        total += s.amount_paid || 0;
      });
      console.log(`  Total settlement amount: ₹${total}`);
    }
  }

  const settlementIds = settlements?.map((s: any) => s.id) || [];

  // Step 4: Check settlement allocations
  console.log("\nStep 4: Checking settlement allocations...");
  const { data: allocations, error: allocError } = await supabase
    .from("tea_shop_settlement_allocations")
    .select("id, settlement_id, entry_id, allocated_amount")
    .in("settlement_id", settlementIds.length > 0 ? settlementIds : ["no-match"]);

  if (allocError) {
    console.error("Error finding allocations:", allocError.message);
  } else {
    console.log("Found allocations:", allocations?.length || 0);
  }

  // Step 5: Check entries payment status
  console.log("\nStep 5: Checking entries payment status...");
  const { data: entries, error: entriesError } = await supabase
    .from("tea_shop_entries")
    .select("id, date, total_amount, amount_paid, is_fully_paid")
    .eq("site_id", siteId)
    .eq("is_fully_paid", true);

  if (entriesError) {
    console.error("Error finding entries:", entriesError.message);
  } else {
    console.log("Found paid entries:", entries?.length || 0);
    if (entries && entries.length > 0) {
      let total = 0;
      entries.slice(0, 5).forEach((e: any) => {
        console.log(`  ${e.date} | Total: ₹${e.total_amount} | Paid: ₹${e.amount_paid}`);
        total += e.amount_paid || 0;
      });
      if (entries.length > 5) {
        console.log(`  ... and ${entries.length - 5} more entries`);
      }
      console.log(`  Total amount_paid in entries: ₹${entries.reduce((s: number, e: any) => s + (e.amount_paid || 0), 0)}`);
    }
  }

  // Step 6: Check group settlements
  console.log("\nStep 6: Checking group settlements...");
  if (siteGroupId) {
    const { data: groupSettlements, error: gsError } = await supabase
      .from("tea_shop_group_settlements")
      .select("id, amount_paid, payment_date")
      .eq("site_group_id", siteGroupId)
      .eq("is_cancelled", false);

    if (gsError) {
      console.error("Error finding group settlements:", gsError.message);
    } else {
      console.log("Found group settlements:", groupSettlements?.length || 0);
      if (groupSettlements && groupSettlements.length > 0) {
        groupSettlements.forEach((gs: any) => {
          console.log(`  ID: ${gs.id} | Amount: ₹${gs.amount_paid} | Date: ${gs.payment_date}`);
        });
      }
    }
  } else {
    console.log("No site group - skipping group settlements check");
  }

  // Now perform the cleanup
  console.log("\n=== PERFORMING CLEANUP ===\n");

  // Delete allocations first (foreign key constraint)
  if (settlementIds.length > 0) {
    console.log("Deleting settlement allocations...");
    const { error: delAllocError, count: allocCount } = await supabase
      .from("tea_shop_settlement_allocations")
      .delete()
      .in("settlement_id", settlementIds);

    if (delAllocError) {
      console.error("Error deleting allocations:", delAllocError.message);
      return;
    }
    console.log(`Deleted allocations for ${settlementIds.length} settlements`);
  }

  // Reset entries to unpaid
  console.log("\nResetting entries to unpaid...");
  const { error: updateError, count: updateCount } = await supabase
    .from("tea_shop_entries")
    .update({ amount_paid: 0, is_fully_paid: false })
    .eq("site_id", siteId);

  if (updateError) {
    console.error("Error updating entries:", updateError.message);
    return;
  }
  console.log(`Reset entries for site ${siteId}`);

  // Delete settlements
  if (shopIds.length > 0) {
    console.log("\nDeleting settlements...");
    const { error: delSettError } = await supabase
      .from("tea_shop_settlements")
      .delete()
      .in("tea_shop_id", shopIds);

    if (delSettError) {
      console.error("Error deleting settlements:", delSettError.message);
      return;
    }
    console.log(`Deleted settlements for ${shopIds.length} tea shop accounts`);
  }

  // Also handle group settlements if they exist
  if (siteGroupId) {
    console.log("\nChecking for group settlement allocations to delete...");

    // Get group settlement IDs first
    const { data: groupSettlementIds } = await supabase
      .from("tea_shop_group_settlements")
      .select("id")
      .eq("site_group_id", siteGroupId);

    if (groupSettlementIds && groupSettlementIds.length > 0) {
      const gsIds = groupSettlementIds.map((gs: any) => gs.id);

      // Delete group settlement allocations
      const { error: delGsAllocError } = await supabase
        .from("tea_shop_group_settlement_allocations")
        .delete()
        .in("settlement_id", gsIds);

      if (delGsAllocError) {
        console.error("Error deleting group settlement allocations:", delGsAllocError.message);
      } else {
        console.log("Deleted group settlement allocations");
      }

      // Delete group settlements
      const { error: delGsError } = await supabase
        .from("tea_shop_group_settlements")
        .delete()
        .eq("site_group_id", siteGroupId);

      if (delGsError) {
        console.error("Error deleting group settlements:", delGsError.message);
      } else {
        console.log("Deleted group settlements");
      }
    }

    // Reset group entries
    const { error: updateGroupError } = await supabase
      .from("tea_shop_group_entries")
      .update({ amount_paid: 0, is_fully_paid: false })
      .eq("site_group_id", siteGroupId);

    if (updateGroupError) {
      console.error("Error updating group entries:", updateGroupError.message);
    } else {
      console.log("Reset group entries");
    }
  }

  console.log("\n=== CLEANUP COMPLETE ===");
  console.log("\nVerifying cleanup...");

  // Verify
  const { data: remainingSettlements } = await supabase
    .from("tea_shop_settlements")
    .select("id")
    .in("tea_shop_id", shopIds.length > 0 ? shopIds : ["no-match"]);

  const { data: paidEntries } = await supabase
    .from("tea_shop_entries")
    .select("id")
    .eq("site_id", siteId)
    .eq("is_fully_paid", true);

  console.log(`Remaining settlements: ${remainingSettlements?.length || 0}`);
  console.log(`Entries still marked as paid: ${paidEntries?.length || 0}`);

  if ((remainingSettlements?.length || 0) === 0 && (paidEntries?.length || 0) === 0) {
    console.log("\n✅ Cleanup successful! You can now create new settlements.");
  } else {
    console.log("\n⚠️ Some records may still exist. Please check manually.");
  }
}

cleanupTeaShopSettlements().catch(console.error);
