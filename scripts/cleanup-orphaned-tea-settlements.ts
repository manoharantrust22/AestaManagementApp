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

async function cleanupOrphanedSettlements() {
  console.log("=== CLEANUP ORPHANED TEA SHOP SETTLEMENTS ===\n");

  // The 5 orphaned settlement IDs linked to "House Construction on Srinivasan Site" subcontract
  const orphanedSettlementIds = [
    "cc684173-aa67-48a5-b5ef-f93d7d79ec29",
    "e76fc818-1a78-43b4-b0e8-afefba04af08",
    "4129b46c-8f6d-4f92-beb3-fa5b51797827",
    "bfa60e9d-5861-4d43-af98-48124c6d2291",
    "e27eb728-f460-43e1-a142-e45c5cc3f4c7",
  ];

  // Step 1: Verify the settlements
  console.log("Step 1: Verifying settlements to cancel...");
  const { data: settlements, error: settError } = await supabase
    .from("tea_shop_settlements")
    .select("id, settlement_reference, amount_paid, is_cancelled, subcontract_id")
    .in("id", orphanedSettlementIds);

  if (settError) {
    console.error("Error fetching settlements:", settError.message);
    return;
  }

  console.log(`Found ${settlements?.length || 0} settlements:`);
  let totalAmount = 0;
  for (const s of settlements || []) {
    console.log(`  ${s.settlement_reference}: ₹${s.amount_paid} (cancelled: ${s.is_cancelled})`);
    totalAmount += s.amount_paid || 0;
  }
  console.log(`Total: ₹${totalAmount}\n`);

  // Step 2: Delete the settlement allocations first (foreign key constraint)
  console.log("Step 2: Deleting settlement allocations...");
  const { error: delAllocError } = await supabase
    .from("tea_shop_settlement_allocations")
    .delete()
    .in("settlement_id", orphanedSettlementIds);

  if (delAllocError) {
    console.error("Error deleting allocations:", delAllocError.message);
    return;
  }
  console.log("Deleted allocations successfully.\n");

  // Step 3: Mark settlements as cancelled and remove subcontract link
  console.log("Step 3: Marking settlements as cancelled...");
  const { error: updateError } = await supabase
    .from("tea_shop_settlements")
    .update({
      is_cancelled: true,
      subcontract_id: null,
      notes: "Cancelled - Orphaned after grouped site migration",
    })
    .in("id", orphanedSettlementIds);

  if (updateError) {
    console.error("Error updating settlements:", updateError.message);
    return;
  }
  console.log("Marked settlements as cancelled.\n");

  // Step 4: Verify the cleanup
  console.log("Step 4: Verifying cleanup...");
  const { data: updatedSettlements } = await supabase
    .from("tea_shop_settlements")
    .select("id, settlement_reference, is_cancelled, subcontract_id")
    .in("id", orphanedSettlementIds);

  for (const s of updatedSettlements || []) {
    console.log(`  ${s.settlement_reference}: cancelled=${s.is_cancelled}, subcontract_id=${s.subcontract_id}`);
  }

  // Step 5: Check subcontract tea settlements
  console.log("\nStep 5: Checking subcontract linked tea settlements...");
  const subcontractId = "1f5fae1d-5327-4865-9605-0714d8202aa7";
  const { data: linkedSettlements } = await supabase
    .from("tea_shop_settlements")
    .select("id, amount_paid, is_cancelled")
    .eq("subcontract_id", subcontractId)
    .eq("is_cancelled", false);

  console.log(`Active tea shop settlements linked to subcontract: ${linkedSettlements?.length || 0}`);
  if (linkedSettlements && linkedSettlements.length > 0) {
    const total = linkedSettlements.reduce((sum, s) => sum + (s.amount_paid || 0), 0);
    console.log(`Total amount: ₹${total}`);
  }

  console.log("\n=== CLEANUP COMPLETE ===");
  console.log("The ₹1,818 should no longer appear in the subcontract payment breakdown.");
}

cleanupOrphanedSettlements().catch(console.error);
