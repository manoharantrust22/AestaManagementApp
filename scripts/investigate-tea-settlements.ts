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

async function investigate() {
  console.log("=== INVESTIGATING TEA SHOP SETTLEMENTS ===\n");

  // Step 1: Find the subcontract for "House Construction on Srinivasan Site"
  console.log("Step 1: Finding subcontract...");
  const { data: subcontracts, error: scError } = await supabase
    .from("subcontracts")
    .select("id, title, site_id")
    .ilike("title", "%Srinivasan%");

  if (scError) {
    console.error("Error:", scError.message);
    return;
  }

  console.log("Found subcontracts:", subcontracts);
  if (!subcontracts || subcontracts.length === 0) {
    console.log("No subcontract found");
    return;
  }

  const subcontract = subcontracts[0];
  const subcontractId = subcontract.id;
  const siteId = subcontract.site_id;
  console.log(`\nUsing subcontract: ${subcontract.title}`);
  console.log(`Subcontract ID: ${subcontractId}`);
  console.log(`Site ID: ${siteId}\n`);

  // Step 2: Find tea shop settlements linked to this subcontract
  console.log("Step 2: Finding tea shop settlements linked to subcontract...");
  const { data: settlements, error: settError } = await supabase
    .from("tea_shop_settlements")
    .select("id, tea_shop_id, amount_paid, payment_date, is_cancelled, status, settlement_reference, subcontract_id")
    .eq("subcontract_id", subcontractId);

  if (settError) {
    console.error("Error:", settError.message);
    return;
  }

  console.log(`Found ${settlements?.length || 0} settlements linked to subcontract:\n`);
  let totalAmount = 0;
  for (const s of settlements || []) {
    console.log(`  ID: ${s.id}`);
    console.log(`  Reference: ${s.settlement_reference}`);
    console.log(`  Amount: ₹${s.amount_paid}`);
    console.log(`  Date: ${s.payment_date}`);
    console.log(`  is_cancelled: ${s.is_cancelled}`);
    console.log(`  status: ${s.status}`);
    console.log(`  tea_shop_id: ${s.tea_shop_id}`);
    console.log("");
    totalAmount += s.amount_paid || 0;
  }
  console.log(`Total amount in these settlements: ₹${totalAmount}\n`);

  // Step 3: Check the tea_shop_accounts for this site
  console.log("Step 3: Checking tea shop accounts for this site...");
  const { data: shopAccounts, error: shopError } = await supabase
    .from("tea_shop_accounts")
    .select("id, shop_name, owner_name, site_id, site_group_id")
    .eq("site_id", siteId);

  if (shopError) {
    console.error("Error:", shopError.message);
  } else {
    console.log(`Found ${shopAccounts?.length || 0} tea shop accounts for site:`);
    for (const shop of shopAccounts || []) {
      console.log(`  Shop: ${shop.shop_name} (${shop.owner_name})`);
      console.log(`  ID: ${shop.id}`);
      console.log(`  site_id: ${shop.site_id}`);
      console.log(`  site_group_id: ${shop.site_group_id}`);
      console.log("");
    }
  }

  // Step 4: Check if settlements' tea_shop_id matches any current shop
  console.log("Step 4: Checking if settlement tea_shop_ids match current shops...");
  const settlementTeaShopIds = (settlements || []).map(s => s.tea_shop_id);
  const currentShopIds = (shopAccounts || []).map(s => s.id);

  console.log("Settlement tea_shop_ids:", settlementTeaShopIds);
  console.log("Current shop IDs:", currentShopIds);

  const orphanedSettlements = (settlements || []).filter(s => !currentShopIds.includes(s.tea_shop_id));
  console.log(`\nOrphaned settlements (tea_shop_id doesn't match current shops): ${orphanedSettlements.length}`);

  // Step 5: Check the site's group membership
  console.log("\nStep 5: Checking site group membership...");
  const { data: site, error: siteError } = await supabase
    .from("sites")
    .select("id, name, site_group_id")
    .eq("id", siteId)
    .single();

  if (siteError) {
    console.error("Error:", siteError.message);
  } else {
    console.log(`Site: ${site.name}`);
    console.log(`Site Group ID: ${site.site_group_id || "None"}`);
  }

  // Step 6: Check if there are settlement allocations for these settlements
  console.log("\nStep 6: Checking settlement allocations...");
  const settlementIds = (settlements || []).map(s => s.id);
  if (settlementIds.length > 0) {
    const { data: allocations, error: allocError } = await supabase
      .from("tea_shop_settlement_allocations")
      .select("id, settlement_id, entry_id, allocated_amount")
      .in("settlement_id", settlementIds);

    if (allocError) {
      console.error("Error:", allocError.message);
    } else {
      console.log(`Found ${allocations?.length || 0} allocations for these settlements`);
      if (allocations && allocations.length > 0) {
        for (const a of allocations) {
          console.log(`  Settlement ${a.settlement_id}: Entry ${a.entry_id} = ₹${a.allocated_amount}`);
        }
      }
    }
  }

  // Step 7: Check how the tea shop UI fetches settlements
  console.log("\nStep 7: Simulating tea shop UI query...");
  // The UI likely filters by tea_shop_id from active shops
  if (currentShopIds.length > 0) {
    const { data: uiSettlements, error: uiError } = await supabase
      .from("tea_shop_settlements")
      .select("id, amount_paid, settlement_reference, is_cancelled")
      .in("tea_shop_id", currentShopIds)
      .eq("is_cancelled", false);

    if (uiError) {
      console.error("Error:", uiError.message);
    } else {
      console.log(`Tea shop UI would show ${uiSettlements?.length || 0} settlements`);
    }
  }

  console.log("\n=== SUMMARY ===");
  console.log(`- ${settlements?.length || 0} settlements linked to subcontract (total: ₹${totalAmount})`);
  console.log(`- ${orphanedSettlements.length} settlements have tea_shop_id that doesn't match current site shops`);
  console.log("- These orphaned settlements show in subcontract but not in tea shop UI");
}

investigate().catch(console.error);
