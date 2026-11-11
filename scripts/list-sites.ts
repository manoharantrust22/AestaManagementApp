import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const envPath = path.join(process.cwd(), ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
envContent.split("\n").forEach((line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, (env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY));

async function main() {
  const { data, error } = await supabase.from("sites").select("id, name, site_group_id");
  if (error) {
    console.error("Error:", error);
    return;
  }
  console.log("All sites:");
  data?.forEach((s: any) => console.log(`  - ${s.name} | Group: ${s.site_group_id || "None"}`));
}

main();
