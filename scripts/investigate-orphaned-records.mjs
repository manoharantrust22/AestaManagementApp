/**
 * Investigate specific orphaned settlement_groups
 * Check if they duplicate existing records with labor_payments
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnvFile(filePath) {
  try {
    const content = readFileSync(filePath, "utf-8");
    content.split("\n").forEach((line) => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  } catch (e) {}
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

const isLocal = process.env.LOCAL === "true";
const supabaseUrl = isLocal
  ? "http://localhost:54321"
  : process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = isLocal
  ? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
  : process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// Records to investigate
const suspiciousRefs = ["SET-202512-048", "SET-202512-043", "SET-202512-041", "SET-202511-008"];

console.log("============================================================");
console.log("INVESTIGATING SUSPICIOUS ORPHANED RECORDS");
console.log(`Timestamp: ${new Date().toISOString()}`);
console.log("============================================================\n");

async function investigate() {
  try {
    for (const ref of suspiciousRefs) {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`RECORD: ${ref}`);
      console.log("=".repeat(60));

      // Get the orphaned record details
      const { data: orphaned } = await supabase
        .from("settlement_groups")
        .select("*")
        .eq("settlement_reference", ref)
        .single();

      if (!orphaned) {
        console.log("  NOT FOUND");
        continue;
      }

      console.log(`\n--- Orphaned Record Details ---`);
      console.log(`  Settlement Date: ${orphaned.settlement_date}`);
      console.log(`  Amount: ₹${orphaned.total_amount?.toLocaleString("en-IN")}`);
      console.log(`  Laborer Count: ${orphaned.laborer_count}`);
      console.log(`  Payment Type: ${orphaned.payment_type}`);
      console.log(`  Created By: ${orphaned.created_by_name}`);
      console.log(`  Created At: ${orphaned.created_at}`);
      console.log(`  Subcontract ID: ${orphaned.subcontract_id || "NULL"}`);

      // Check labor_payments for this record
      const { data: lpForOrphaned } = await supabase
        .from("labor_payments")
        .select("*")
        .eq("settlement_group_id", orphaned.id);

      console.log(`\n--- Labor Payments linked: ${lpForOrphaned?.length || 0} ---`);

      // Find OTHER settlement_groups on the same date for the same site
      const { data: sameDateSettlements } = await supabase
        .from("settlement_groups")
        .select("*")
        .eq("site_id", orphaned.site_id)
        .eq("settlement_date", orphaned.settlement_date)
        .eq("is_cancelled", false)
        .neq("id", orphaned.id);

      console.log(`\n--- Other settlements on ${orphaned.settlement_date} ---`);
      if (sameDateSettlements?.length === 0) {
        console.log("  No other settlements on this date");
      } else {
        for (const sg of sameDateSettlements || []) {
          const { data: lpCount } = await supabase
            .from("labor_payments")
            .select("id", { count: "exact" })
            .eq("settlement_group_id", sg.id);

          console.log(`\n  ${sg.settlement_reference}`);
          console.log(`    Amount: ₹${sg.total_amount?.toLocaleString("en-IN")}`);
          console.log(`    Laborer Count: ${sg.laborer_count}`);
          console.log(`    Created By: ${sg.created_by_name}`);
          console.log(`    Labor Payments linked: ${lpCount?.length || 0}`);
        }
      }

      // Check if there's a non-orphaned settlement with similar amount
      console.log(`\n--- Looking for similar settlements (amount: ₹${orphaned.total_amount}) ---`);
      const { data: similarAmount } = await supabase
        .from("settlement_groups")
        .select("*")
        .eq("site_id", orphaned.site_id)
        .eq("total_amount", orphaned.total_amount)
        .eq("is_cancelled", false)
        .neq("id", orphaned.id);

      if (similarAmount?.length === 0) {
        console.log("  No other settlements with same amount");
      } else {
        for (const sg of similarAmount || []) {
          const { data: lpCount } = await supabase
            .from("labor_payments")
            .select("id", { count: "exact" })
            .eq("settlement_group_id", sg.id);

          console.log(`\n  ${sg.settlement_reference} (Date: ${sg.settlement_date})`);
          console.log(`    Amount: ₹${sg.total_amount?.toLocaleString("en-IN")}`);
          console.log(`    Labor Payments linked: ${lpCount?.length || 0}`);
        }
      }

      // Check daily_attendance for that date
      console.log(`\n--- Daily Attendance on ${orphaned.settlement_date} ---`);
      const { data: dailyAtt } = await supabase
        .from("daily_attendance")
        .select("id, laborer_id, wage, is_paid, settlement_group_id")
        .eq("site_id", orphaned.site_id)
        .eq("work_date", orphaned.settlement_date);

      if (!dailyAtt || dailyAtt.length === 0) {
        console.log("  No daily attendance records");
      } else {
        const paid = dailyAtt.filter(a => a.is_paid);
        const unpaid = dailyAtt.filter(a => !a.is_paid);
        const linkedToOrphaned = dailyAtt.filter(a => a.settlement_group_id === orphaned.id);
        console.log(`  Total: ${dailyAtt.length}`);
        console.log(`  Paid: ${paid.length}`);
        console.log(`  Unpaid: ${unpaid.length}`);
        console.log(`  Linked to this orphaned record: ${linkedToOrphaned.length}`);
        console.log(`  Total wage: ₹${dailyAtt.reduce((s, a) => s + (a.wage || 0), 0).toLocaleString("en-IN")}`);
      }

      // Check market_laborer_attendance for that date
      console.log(`\n--- Market Attendance on ${orphaned.settlement_date} ---`);
      const { data: marketAtt } = await supabase
        .from("market_laborer_attendance")
        .select("id, laborer_id, amount, is_paid, settlement_group_id")
        .eq("site_id", orphaned.site_id)
        .eq("work_date", orphaned.settlement_date);

      if (!marketAtt || marketAtt.length === 0) {
        console.log("  No market attendance records");
      } else {
        const paid = marketAtt.filter(a => a.is_paid);
        const unpaid = marketAtt.filter(a => !a.is_paid);
        const linkedToOrphaned = marketAtt.filter(a => a.settlement_group_id === orphaned.id);
        console.log(`  Total: ${marketAtt.length}`);
        console.log(`  Paid: ${paid.length}`);
        console.log(`  Unpaid: ${unpaid.length}`);
        console.log(`  Linked to this orphaned record: ${linkedToOrphaned.length}`);
        console.log(`  Total amount: ₹${marketAtt.reduce((s, a) => s + (a.amount || 0), 0).toLocaleString("en-IN")}`);
      }
    }

    console.log("\n\n============================================================");
    console.log("INVESTIGATION COMPLETE");
    console.log("============================================================");

  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

investigate();
