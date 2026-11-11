import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import readline from "readline";

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

const CUTOFF_DATE = "2024-11-14";

// Helper for confirmation prompt
function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

async function cleanupPadmavatiSrinivasaTeashop() {
  console.log("=".repeat(60));
  console.log("TEA SHOP CLEANUP - PADMAVATI & SRINIVASA");
  console.log(`Cutoff date: ${CUTOFF_DATE} (entries on or after will be deleted)`);
  console.log("=".repeat(60));
  console.log("");

  // Check if --execute flag is provided
  const executeMode = process.argv.includes("--execute");
  if (!executeMode) {
    console.log("⚠️  DRY RUN MODE - No data will be deleted");
    console.log("   Run with --execute flag to actually delete data");
    console.log("");
  }

  // Step 1: Find sites
  console.log("STEP 1: Finding Padmavathy and Srinivasan sites...");
  const { data: sites, error: sitesError } = await supabase
    .from("sites")
    .select("id, name, site_group_id")
    .or("name.ilike.%Padmavathy%,name.ilike.%Srinivasan%");

  if (sitesError) {
    console.error("❌ Error finding sites:", sitesError.message);
    return;
  }

  if (!sites || sites.length === 0) {
    console.log("❌ No sites found matching 'Padmavathy' or 'Srinivasan'");
    return;
  }

  console.log(`Found ${sites.length} site(s):`);
  sites.forEach((s: any) => {
    console.log(`  - ${s.name} (ID: ${s.id})`);
    console.log(`    Site Group ID: ${s.site_group_id || "None"}`);
  });
  console.log("");

  const siteIds = sites.map((s: any) => s.id);
  const siteGroupIds = [...new Set(sites.map((s: any) => s.site_group_id).filter(Boolean))];

  // Step 2: Find tea shop entries after cutoff date
  console.log(`STEP 2: Finding tea shop entries from ${CUTOFF_DATE} onwards...`);
  const { data: entries, error: entriesError } = await supabase
    .from("tea_shop_entries")
    .select("id, site_id, date, total_amount, amount_paid, is_fully_paid, is_group_entry")
    .in("site_id", siteIds)
    .gte("date", CUTOFF_DATE)
    .order("date", { ascending: true });

  if (entriesError) {
    console.error("❌ Error finding entries:", entriesError.message);
    return;
  }

  const entryIds = entries?.map((e: any) => e.id) || [];
  const totalEntryAmount = entries?.reduce((sum: number, e: any) => sum + (e.total_amount || 0), 0) || 0;

  console.log(`Found ${entries?.length || 0} entries (Total: ₹${totalEntryAmount.toLocaleString()})`);
  if (entries && entries.length > 0) {
    console.log("  Sample entries:");
    entries.slice(0, 5).forEach((e: any) => {
      console.log(`    ${e.date} | ₹${e.total_amount} | Paid: ₹${e.amount_paid || 0} | Group: ${e.is_group_entry ? "Yes" : "No"}`);
    });
    if (entries.length > 5) {
      console.log(`    ... and ${entries.length - 5} more`);
    }
  }
  console.log("");

  // Step 3: Find entry allocations
  console.log("STEP 3: Finding entry allocations...");
  const { data: entryAllocs, error: entryAllocsError } = await supabase
    .from("tea_shop_entry_allocations")
    .select("id, entry_id, allocated_amount")
    .in("entry_id", entryIds.length > 0 ? entryIds : ["no-match"]);

  if (entryAllocsError) {
    console.error("❌ Error finding entry allocations:", entryAllocsError.message);
  }

  console.log(`Found ${entryAllocs?.length || 0} entry allocations`);
  console.log("");

  // Step 4: Find settlement allocations for these entries
  console.log("STEP 4: Finding settlement allocations...");
  const { data: settlementAllocs, error: settlementAllocsError } = await supabase
    .from("tea_shop_settlement_allocations")
    .select("id, settlement_id, entry_id, allocated_amount")
    .in("entry_id", entryIds.length > 0 ? entryIds : ["no-match"]);

  if (settlementAllocsError) {
    console.error("❌ Error finding settlement allocations:", settlementAllocsError.message);
  }

  const settlementIds = [...new Set((settlementAllocs || []).map((a: any) => a.settlement_id))];
  console.log(`Found ${settlementAllocs?.length || 0} settlement allocations`);
  console.log(`Linked to ${settlementIds.length} settlement(s)`);
  console.log("");

  // Step 5: Find settlements
  console.log("STEP 5: Finding linked settlements...");
  const { data: settlements, error: settlementsError } = await supabase
    .from("tea_shop_settlements")
    .select("id, settlement_reference, amount_paid, payment_date, subcontract_id")
    .in("id", settlementIds.length > 0 ? settlementIds : ["no-match"]);

  if (settlementsError) {
    console.error("❌ Error finding settlements:", settlementsError.message);
  }

  const totalSettlementAmount = settlements?.reduce((sum: number, s: any) => sum + (s.amount_paid || 0), 0) || 0;
  console.log(`Found ${settlements?.length || 0} settlements (Total paid: ₹${totalSettlementAmount.toLocaleString()})`);
  if (settlements && settlements.length > 0) {
    settlements.forEach((s: any) => {
      console.log(`  - ${s.settlement_reference || s.id.slice(0, 8)}`);
      console.log(`    Amount: ₹${s.amount_paid} | Date: ${s.payment_date}`);
      console.log(`    Subcontract: ${s.subcontract_id ? "Linked" : "None"}`);
    });
  }
  console.log("");

  // Step 6: Find group entries (if any)
  console.log("STEP 6: Checking for group entries...");
  let groupEntryIds: string[] = [];
  let groupSettlementIds: string[] = [];

  if (siteGroupIds.length > 0) {
    const { data: groupEntries, error: groupEntriesError } = await supabase
      .from("tea_shop_group_entries")
      .select("id, date, total_amount")
      .in("site_group_id", siteGroupIds)
      .gte("date", CUTOFF_DATE);

    if (groupEntriesError) {
      console.error("❌ Error finding group entries:", groupEntriesError.message);
    } else {
      groupEntryIds = groupEntries?.map((e: any) => e.id) || [];
      console.log(`Found ${groupEntries?.length || 0} group entries`);
    }

    // Group settlements
    const { data: groupSettlements, error: groupSettlementsError } = await supabase
      .from("tea_shop_group_settlements")
      .select("id, settlement_reference, amount_paid")
      .in("site_group_id", siteGroupIds)
      .gte("period_start", CUTOFF_DATE);

    if (groupSettlementsError) {
      console.error("❌ Error finding group settlements:", groupSettlementsError.message);
    } else {
      groupSettlementIds = groupSettlements?.map((s: any) => s.id) || [];
      console.log(`Found ${groupSettlements?.length || 0} group settlements`);
    }
  } else {
    console.log("No site groups found - skipping group tables");
  }
  console.log("");

  // Summary
  console.log("=".repeat(60));
  console.log("SUMMARY - DATA TO BE DELETED:");
  console.log("=".repeat(60));
  console.log(`  Tea Shop Entries:           ${entries?.length || 0} records (₹${totalEntryAmount.toLocaleString()})`);
  console.log(`  Entry Allocations:          ${entryAllocs?.length || 0} records`);
  console.log(`  Settlement Allocations:     ${settlementAllocs?.length || 0} records`);
  console.log(`  Settlements:                ${settlements?.length || 0} records (₹${totalSettlementAmount.toLocaleString()})`);
  console.log(`  Group Entries:              ${groupEntryIds.length} records`);
  console.log(`  Group Settlements:          ${groupSettlementIds.length} records`);
  console.log("=".repeat(60));
  console.log("");

  if (!executeMode) {
    console.log("⚠️  DRY RUN COMPLETE - No data was deleted");
    console.log("   To actually delete, run: npx tsx scripts/cleanup-padmavati-srinivasa-teashop.ts --execute");
    return;
  }

  // Confirm deletion
  const confirmed = await askConfirmation(
    "⚠️  WARNING: This will permanently delete the above data.\n   Are you sure you want to proceed? (y/N): "
  );

  if (!confirmed) {
    console.log("❌ Cleanup cancelled by user");
    return;
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("PERFORMING CLEANUP...");
  console.log("=".repeat(60));
  console.log("");

  // Delete in correct order (respecting foreign keys)

  // 1. Delete settlement allocations
  if (settlementAllocs && settlementAllocs.length > 0) {
    console.log("1. Deleting settlement allocations...");
    const { error: delError } = await supabase
      .from("tea_shop_settlement_allocations")
      .delete()
      .in("entry_id", entryIds);

    if (delError) {
      console.error("   ❌ Error:", delError.message);
      return;
    }
    console.log(`   ✅ Deleted ${settlementAllocs.length} settlement allocations`);
  }

  // 2. Delete settlements
  if (settlements && settlements.length > 0) {
    console.log("2. Deleting settlements...");
    const { error: delError } = await supabase
      .from("tea_shop_settlements")
      .delete()
      .in("id", settlementIds);

    if (delError) {
      console.error("   ❌ Error:", delError.message);
      return;
    }
    console.log(`   ✅ Deleted ${settlements.length} settlements`);
  }

  // 3. Delete entry allocations
  if (entryAllocs && entryAllocs.length > 0) {
    console.log("3. Deleting entry allocations...");
    const { error: delError } = await supabase
      .from("tea_shop_entry_allocations")
      .delete()
      .in("entry_id", entryIds);

    if (delError) {
      console.error("   ❌ Error:", delError.message);
      return;
    }
    console.log(`   ✅ Deleted ${entryAllocs.length} entry allocations`);
  }

  // 4. Delete entries
  if (entries && entries.length > 0) {
    console.log("4. Deleting tea shop entries...");
    const { error: delError } = await supabase
      .from("tea_shop_entries")
      .delete()
      .in("id", entryIds);

    if (delError) {
      console.error("   ❌ Error:", delError.message);
      return;
    }
    console.log(`   ✅ Deleted ${entries.length} entries`);
  }

  // 5. Delete group settlement allocations and settlements
  if (groupSettlementIds.length > 0) {
    console.log("5. Deleting group settlement allocations...");
    const { error: delGsAllocError } = await supabase
      .from("tea_shop_group_settlement_allocations")
      .delete()
      .in("settlement_id", groupSettlementIds);

    if (delGsAllocError) {
      console.error("   ❌ Error:", delGsAllocError.message);
    } else {
      console.log("   ✅ Deleted group settlement allocations");
    }

    console.log("6. Deleting group settlements...");
    const { error: delGsError } = await supabase
      .from("tea_shop_group_settlements")
      .delete()
      .in("id", groupSettlementIds);

    if (delGsError) {
      console.error("   ❌ Error:", delGsError.message);
    } else {
      console.log(`   ✅ Deleted ${groupSettlementIds.length} group settlements`);
    }
  }

  // 6. Delete group entry allocations and entries
  if (groupEntryIds.length > 0) {
    console.log("7. Deleting group entry allocations...");
    const { error: delGeAllocError } = await supabase
      .from("tea_shop_group_allocations")
      .delete()
      .in("group_entry_id", groupEntryIds);

    if (delGeAllocError) {
      console.error("   ❌ Error:", delGeAllocError.message);
    } else {
      console.log("   ✅ Deleted group entry allocations");
    }

    console.log("8. Deleting group entries...");
    const { error: delGeError } = await supabase
      .from("tea_shop_group_entries")
      .delete()
      .in("id", groupEntryIds);

    if (delGeError) {
      console.error("   ❌ Error:", delGeError.message);
    } else {
      console.log(`   ✅ Deleted ${groupEntryIds.length} group entries`);
    }
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("VERIFYING CLEANUP...");
  console.log("=".repeat(60));

  // Verify
  const { data: remainingEntries } = await supabase
    .from("tea_shop_entries")
    .select("id")
    .in("site_id", siteIds)
    .gte("date", CUTOFF_DATE);

  const { data: remainingSettlements } = await supabase
    .from("tea_shop_settlements")
    .select("id")
    .in("id", settlementIds.length > 0 ? settlementIds : ["no-match"]);

  console.log(`Remaining entries after ${CUTOFF_DATE}: ${remainingEntries?.length || 0}`);
  console.log(`Remaining settlements: ${remainingSettlements?.length || 0}`);

  if ((remainingEntries?.length || 0) === 0 && (remainingSettlements?.length || 0) === 0) {
    console.log("");
    console.log("✅ CLEANUP SUCCESSFUL!");
    console.log("");
    console.log("Next steps:");
    console.log("1. Enter historical settlements using 'Historical/Standalone' mode");
    console.log("2. Re-enter daily data from Nov 14 onwards with proper group allocation");
  } else {
    console.log("");
    console.log("⚠️ Some records may still exist. Please check manually.");
  }
}

cleanupPadmavatiSrinivasaTeashop().catch(console.error);
