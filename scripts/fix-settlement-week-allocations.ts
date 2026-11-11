/**
 * Script to add week_allocations to restored settlements
 *
 * The restored settlements don't have week_allocations JSONB set,
 * which causes getDateWiseSettlements to filter them out.
 *
 * This script:
 * 1. Finds all settlement_groups without week_allocations
 * 2. Parses the notes field for work date (e.g., "Work date: 2025-12-17")
 * 3. Calculates week boundaries for that date
 * 4. Updates week_allocations with proper structure
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

// Get week boundaries (Sunday to Saturday)
function getWeekBoundaries(dateStr: string): { weekStart: string; weekEnd: string; weekLabel: string } {
  const date = new Date(dateStr);
  const dayOfWeek = date.getDay(); // 0 = Sunday

  // Get Sunday (start of week)
  const weekStart = new Date(date);
  weekStart.setDate(date.getDate() - dayOfWeek);

  // Get Saturday (end of week)
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  // Create week label like "Dec 15 - Dec 21"
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const startMonth = monthNames[weekStart.getMonth()];
  const endMonth = monthNames[weekEnd.getMonth()];
  const startDay = weekStart.getDate();
  const endDay = weekEnd.getDate();

  let weekLabel: string;
  if (startMonth === endMonth) {
    weekLabel = `${startMonth} ${startDay} - ${endDay}`;
  } else {
    weekLabel = `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
  }

  return {
    weekStart: formatDate(weekStart),
    weekEnd: formatDate(weekEnd),
    weekLabel,
  };
}

// Extract work date from notes field
function extractWorkDate(notes: string | null): string | null {
  if (!notes) return null;

  // Pattern: "Work date: 2025-12-17" or similar
  const match = notes.match(/Work date:\s*(\d{4}-\d{2}-\d{2})/i);
  if (match) {
    return match[1];
  }

  return null;
}

async function fixSettlementWeekAllocations() {
  console.log("=== FIXING SETTLEMENT WEEK ALLOCATIONS ===\n");

  // Step 1: Find all settlement_groups without week_allocations
  const { data: settlements, error } = await supabase
    .from("settlement_groups")
    .select("id, settlement_reference, settlement_date, total_amount, laborer_count, notes, week_allocations")
    .eq("is_cancelled", false)
    .is("week_allocations", null);

  if (error) {
    console.error("Error fetching settlements:", error.message);
    return;
  }

  console.log(`Found ${settlements?.length || 0} settlements without week_allocations\n`);

  if (!settlements || settlements.length === 0) {
    console.log("No settlements need fixing.");
    return;
  }

  let updatedCount = 0;
  let errorCount = 0;

  for (const sg of settlements) {
    // Try to get work date from notes, or fall back to settlement_date
    let workDate = extractWorkDate(sg.notes);
    if (!workDate) {
      // Fall back to settlement_date
      workDate = sg.settlement_date;
    }

    if (!workDate) {
      console.log(`  Skipping ${sg.settlement_reference}: No date available`);
      errorCount++;
      continue;
    }

    // Calculate week boundaries
    const { weekStart, weekEnd, weekLabel } = getWeekBoundaries(workDate);

    // Create week_allocations array
    const weekAllocations = [
      {
        weekStart,
        weekEnd,
        weekLabel,
        allocatedAmount: sg.total_amount || 0,
        laborerCount: sg.laborer_count || 1,
        isFullyPaid: true, // These are already recorded payments
      },
    ];

    // Update the settlement_group
    const { error: updateError } = await (supabase as any)
      .from("settlement_groups")
      .update({ week_allocations: weekAllocations })
      .eq("id", sg.id);

    if (updateError) {
      console.error(`  Error updating ${sg.settlement_reference}:`, updateError.message);
      errorCount++;
      continue;
    }

    console.log(`  Updated ${sg.settlement_reference}: ${weekLabel} (${workDate})`);
    updatedCount++;
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Updated: ${updatedCount} settlements`);
  console.log(`Errors: ${errorCount}`);
  console.log("\nSettlements now have week_allocations and should appear in the dialog.");
}

// Run the fix
fixSettlementWeekAllocations().catch(console.error);
