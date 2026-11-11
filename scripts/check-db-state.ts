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

async function check() {
  console.log("=== CHECKING DATABASE STATE ===\n");

  // Check settlement_groups
  const { data: settlements, error: e1 } = await supabase
    .from("settlement_groups")
    .select("id, settlement_type, total_amount, is_cancelled, created_at, settlement_reference")
    .order("created_at", { ascending: false })
    .limit(30);

  console.log("Settlement Groups:", settlements?.length || 0, "records");
  if (settlements && settlements.length > 0) {
    console.log("\nRecent settlements:");
    settlements.forEach((s: any) => console.log(`  ${s.settlement_reference} | Type: ${s.settlement_type} | Amount: ${s.total_amount} | Cancelled: ${s.is_cancelled}`));
  }
  if (e1) console.log("Error:", e1.message);

  // Check labor_payments
  const { count: lpCount } = await supabase
    .from("labor_payments")
    .select("*", { count: "exact", head: true });
  console.log("\nLabor Payments count:", lpCount);

  // Check daily_attendance with payments
  const { count: paidCount } = await supabase
    .from("daily_attendance")
    .select("*", { count: "exact", head: true })
    .eq("is_paid", true);
  console.log("Paid attendance records:", paidCount);

  // Check if there are any cancelled settlements
  const { data: cancelledSettlements } = await supabase
    .from("settlement_groups")
    .select("id, settlement_reference, total_amount, cancelled_at")
    .eq("is_cancelled", true);

  console.log("\nCancelled settlements:", cancelledSettlements?.length || 0);
  if (cancelledSettlements && cancelledSettlements.length > 0) {
    cancelledSettlements.forEach((s: any) => console.log(`  ${s.settlement_reference} | Amount: ${s.total_amount} | Cancelled: ${s.cancelled_at}`));
  }

  // Check v_all_expenses for any labor expenses
  const { data: laborExpenses, error: expError } = await supabase
    .from("v_all_expenses")
    .select("*")
    .eq("module", "LABOR")
    .limit(20);

  console.log("\nLabor expenses in v_all_expenses:", laborExpenses?.length || 0);
  if (laborExpenses && laborExpenses.length > 0) {
    laborExpenses.forEach((e: any) => console.log(`  ${e.ref_code} | ${e.category} | ${e.amount}`));
  }
  if (expError) console.log("Expense view error:", expError.message);
}

async function checkMoreTables() {
  console.log("\n=== CHECKING MORE TABLES ===\n");

  // Check daily_settlements table (for daily/market settlements)
  const { data: dailySettlements, error: dsErr } = await supabase
    .from("daily_settlements")
    .select("id, settlement_date, total_amount, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  console.log("Daily Settlements:", dailySettlements?.length || 0, "records");
  if (dailySettlements && dailySettlements.length > 0) {
    dailySettlements.forEach((s: any) => console.log(`  ID: ${s.id} | Date: ${s.settlement_date} | Amount: ${s.total_amount}`));
  }
  if (dsErr) console.log("Daily settlements error:", dsErr.message);

  // Check payment_entries table
  const { data: paymentEntries, count: peCount } = await supabase
    .from("payment_entries")
    .select("*", { count: "exact" })
    .limit(10);

  console.log("\nPayment Entries:", peCount, "records");
  if (paymentEntries && paymentEntries.length > 0) {
    paymentEntries.slice(0, 5).forEach((p: any) => console.log(`  ${p.payment_reference} | ${p.amount} | ${p.payment_type}`));
  }

  // Check v_all_expenses with different filters
  const { data: allExpenses, count: expCount } = await supabase
    .from("v_all_expenses")
    .select("*", { count: "exact" })
    .limit(20);

  console.log("\nAll expenses in v_all_expenses:", expCount, "records");
  if (allExpenses && allExpenses.length > 0) {
    allExpenses.forEach((e: any) => console.log(`  ${e.ref_code} | ${e.module} | ${e.category} | ${e.amount}`));
  }

  // Check labor_attendance_summary or similar views
  const { data: laborSummary, error: lsErr } = await supabase
    .from("v_labor_payment_summary")
    .select("*")
    .limit(10);

  console.log("\nLabor Payment Summary view:", laborSummary?.length || 0, "records");
  if (lsErr) console.log("Labor summary error:", lsErr.message);

  // Check attendance for specific site
  const { data: attendanceStats } = await supabase
    .from("daily_attendance")
    .select("is_paid, payment_id, settlement_group_id")
    .limit(100);

  if (attendanceStats) {
    const paid = attendanceStats.filter((a: any) => a.is_paid).length;
    const withPaymentId = attendanceStats.filter((a: any) => a.payment_id).length;
    const withSettlementGroupId = attendanceStats.filter((a: any) => a.settlement_group_id).length;
    console.log("\nAttendance sample (100 records):");
    console.log(`  is_paid=true: ${paid}`);
    console.log(`  has payment_id: ${withPaymentId}`);
    console.log(`  has settlement_group_id: ${withSettlementGroupId}`);
  }
}

async function checkDailyMarketData() {
  console.log("\n=== CHECKING DAILY/MARKET DATA ===\n");

  // Check daily_attendance with payment info (using correct column names: date, daily_earnings)
  const { data: dailyAtt, count: daCount, error: daErr } = await supabase
    .from("daily_attendance")
    .select("id, date, is_paid, payment_date, daily_earnings, payer_source, payment_id, settlement_group_id", { count: "exact" })
    .eq("is_paid", true)
    .limit(20);

  if (daErr) console.log("Daily attendance error:", daErr.message);
  console.log("Paid Daily Attendance:", daCount, "records");
  if (dailyAtt && dailyAtt.length > 0) {
    dailyAtt.slice(0, 10).forEach((a: any) => console.log(`  Date: ${a.date} | Earnings: ${a.daily_earnings} | Source: ${a.payer_source} | PayDate: ${a.payment_date} | PaymentId: ${a.payment_id}`));
  }

  // Check market_laborer_attendance (uses total_cost column)
  const { data: marketAtt, count: maCount, error: maErr } = await supabase
    .from("market_laborer_attendance")
    .select("id, date, is_paid, payment_date, total_cost, payer_source, count", { count: "exact" })
    .eq("is_paid", true)
    .limit(20);

  if (maErr) console.log("Market attendance error:", maErr.message);
  console.log("\nPaid Market Attendance:", maCount, "records");
  if (marketAtt && marketAtt.length > 0) {
    marketAtt.slice(0, 10).forEach((a: any) => console.log(`  Date: ${a.date} | Cost: ${a.total_cost} | Count: ${a.count} | Source: ${a.payer_source}`));
  }

  // Check expenses table
  const { data: expenses, count: expCount } = await supabase
    .from("expenses")
    .select("id, expense_type, amount, created_at, description", { count: "exact" })
    .limit(20);

  console.log("\nExpenses table:", expCount, "records");
  if (expenses && expenses.length > 0) {
    expenses.slice(0, 10).forEach((e: any) => console.log(`  Type: ${e.expense_type} | Amount: ${e.amount} | ${e.description?.substring(0, 30)}`));
  }

  // Check site_engineer_transactions
  const { data: engTrans, count: etCount } = await supabase
    .from("site_engineer_transactions")
    .select("id, transaction_type, amount, created_at", { count: "exact" })
    .limit(20);

  console.log("\nSite Engineer Transactions:", etCount, "records");
  if (engTrans && engTrans.length > 0) {
    engTrans.slice(0, 10).forEach((t: any) => console.log(`  Type: ${t.transaction_type} | Amount: ${t.amount}`));
  }

  // Sum of all paid daily/market attendance
  const { data: dailySum } = await supabase
    .from("daily_attendance")
    .select("daily_earnings")
    .eq("is_paid", true);

  const dailyTotal = dailySum?.reduce((sum: number, a: any) => sum + (a.daily_earnings || 0), 0) || 0;
  console.log("\nTotal Daily Paid amount:", dailyTotal);

  const { data: marketSum } = await supabase
    .from("market_laborer_attendance")
    .select("total_cost")
    .eq("is_paid", true);

  const marketTotal = marketSum?.reduce((sum: number, a: any) => sum + (a.total_cost || 0), 0) || 0;
  console.log("Total Market Paid amount:", marketTotal);
  console.log("Combined Daily+Market Total:", dailyTotal + marketTotal);
}

check().then(() => checkMoreTables()).then(() => checkDailyMarketData()).catch(console.error);
