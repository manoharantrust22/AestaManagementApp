import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

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

async function check() {
  console.log("Checking old Elango Tea shop...\n");

  const { data: oldShop, error } = await supabase
    .from("tea_shop_accounts")
    .select("*")
    .eq("id", "0c6854f6-0df7-404a-911b-30ed408de578")
    .maybeSingle();

  if (error) {
    console.log("Error:", error.message);
  } else if (oldShop) {
    console.log("Old Elango Tea shop EXISTS:");
    console.log(JSON.stringify(oldShop, null, 2));
  } else {
    console.log("Old Elango Tea shop does NOT exist in tea_shop_accounts table");
    console.log("The tea shop may have been deleted, but the settlements remain orphaned.");
  }

  // Also check what site that old tea shop was for
  console.log("\nLooking for any tea shop with name containing 'Elango'...");
  const { data: elangoShops } = await supabase
    .from("tea_shop_accounts")
    .select("id, shop_name, owner_name, site_id")
    .ilike("shop_name", "%Elango%");

  console.log("Elango tea shops found:", elangoShops?.length || 0);
  if (elangoShops && elangoShops.length > 0) {
    for (const shop of elangoShops) {
      console.log(`  ${shop.shop_name} (${shop.owner_name}) - ID: ${shop.id}`);
    }
  }
}

check().catch(console.error);
