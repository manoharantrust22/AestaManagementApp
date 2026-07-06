/**
 * Query Builder
 * Maps intents to Supabase query functions
 */

import { createClient } from "@/lib/supabase/client";
import { formatCurrencyFull } from "@/lib/formatters";
import type { QueryFunction, QueryResult, IntentFilters } from "./types";

// ============================================================================
// Query Registry
// Maps intent names to query functions
// ============================================================================

export const QUERY_REGISTRY: Record<string, QueryFunction> = {
  // Salary
  total_salary: querySalaryTotal,
  total_salary_paid: querySalaryPaid,
  salary_pending: querySalaryPending,

  // Attendance
  attendance_count: queryAttendanceCount,
  attendance_summary: queryAttendanceSummary,

  // Expenses
  total_spending: queryTotalSpending,
  expense_total: queryExpenseTotal,
  expense_by_category: queryExpenseByCategory,
  material_expenses: queryMaterialExpenses,
  labor_expenses: queryLaborExpenses,
  machinery_expenses: queryMachineryExpenses,

  // Advances
  advance_total: queryAdvanceTotal,
  advance_pending: queryAdvancePending,

  // Contracts
  contract_summary: queryContractSummary,
  contract_payments_total: queryContractPaymentsTotal,

  // Laborers
  laborer_count: queryLaborerCount,
  laborer_by_category: queryLaborerByCategory,
  laborer_earnings: queryLaborerEarnings,

  // Tea Shop
  tea_shop_balance: queryTeaShopBalance,

  // Teams
  team_summary: queryTeamSummary,

  // Daily Cost
  daily_cost: queryDailyCost,

  // Holidays
  holiday_list: queryHolidayList,

  // Work Days Summary
  work_days_summary: queryWorkDaysSummary,
};

// ============================================================================
// Salary Queries
// ============================================================================

async function querySalaryTotal(filters: IntentFilters): Promise<QueryResult> {
  const supabase = createClient();

  let query = supabase.from("salary_periods").select("net_payable");

  if (filters.site_id) {
    // salary_periods doesn't have site_id directly, need to filter via laborer
    // For now, we'll get all and filter in JS if needed
  }

  if (filters.date_from) {
    query = query.gte("week_ending", filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte("week_ending", filters.date_to);
  }

  const { data, error } = await query;

  if (error) throw error;

  const total = (data || []).reduce((sum, row) => sum + (row.net_payable || 0), 0);

  return {
    type: total > 0 ? "value" : "empty",
    value: total,
    label: "Total salary",
    dateRange:
      filters.date_from && filters.date_to
        ? { from: filters.date_from, to: filters.date_to }
        : undefined,
  };
}

async function querySalaryPaid(filters: IntentFilters): Promise<QueryResult> {
  const supabase = createClient();

  let query = supabase.from("salary_payments").select("amount, payment_date");

  if (filters.date_from) {
    query = query.gte("payment_date", filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte("payment_date", filters.date_to);
  }

  const { data, error } = await query;

  if (error) throw error;

  const total = (data || []).reduce((sum, row) => sum + (row.amount || 0), 0);

  return {
    type: total > 0 ? "value" : "empty",
    value: total,
    label: "Salary paid",
    dateRange:
      filters.date_from && filters.date_to
        ? { from: filters.date_from, to: filters.date_to }
        : undefined,
  };
}

async function querySalaryPending(filters: IntentFilters): Promise<QueryResult> {
  const supabase = createClient();

  let query = supabase
    .from("salary_periods")
    .select("balance_due")
    .neq("status", "paid");

  if (filters.date_from) {
    query = query.gte("week_ending", filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte("week_ending", filters.date_to);
  }

  const { data, error } = await query;

  if (error) throw error;

  const total = (data || []).reduce((sum, row) => sum + (row.balance_due || 0), 0);

  return {
    type: total > 0 ? "value" : "empty",
    value: total,
    label: "Pending salary",
    dateRange:
      filters.date_from && filters.date_to
        ? { from: filters.date_from, to: filters.date_to }
        : undefined,
  };
}

// ============================================================================
// Attendance Queries
// ============================================================================

async function queryAttendanceCount(filters: IntentFilters): Promise<QueryResult> {
  const supabase = createClient();

  let query = supabase
    .from("daily_attendance")
    .select("laborer_id")
    .eq("is_deleted", false);

  if (filters.site_id) {
    query = query.eq("site_id", filters.site_id);
  }

  if (filters.date_from && filters.date_to) {
    if (filters.date_from === filters.date_to) {
      query = query.eq("date", filters.date_from);
    } else {
      query = query.gte("date", filters.date_from).lte("date", filters.date_to);
    }
  } else if (filters.date_from) {
    query = query.eq("date", filters.date_from);
  }

  const { data, error } = await query;

  if (error) throw error;

  // Count distinct laborers
  const uniqueLaborers = new Set((data || []).map((r) => r.laborer_id));
  const count = uniqueLaborers.size;

  return {
    type: count > 0 ? "value" : "empty",
    value: count,
    label: "workers present",
    dateRange:
      filters.date_from && filters.date_to
        ? { from: filters.date_from, to: filters.date_to }
        : undefined,
  };
}

async function queryAttendanceSummary(filters: IntentFilters): Promise<QueryResult> {
  const supabase = createClient();

  let query = supabase
    .from("daily_attendance")
    .select("date, laborer_id, daily_earnings")
    .eq("is_deleted", false);

  if (filters.site_id) {
    query = query.eq("site_id", filters.site_id);
  }

  if (filters.date_from) {
    query = query.gte("date", filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte("date", filters.date_to);
  }

  query = query.order("date", { ascending: true });

  const { data, error } = await query;

  if (error) throw error;

  if (!data || data.length === 0) {
    return { type: "empty" };
  }

  // Group by date
  const byDate = new Map<string, { count: number; earnings: number }>();
  for (const row of data) {
    const existing = byDate.get(row.date) || { count: 0, earnings: 0 };
    existing.count++;
    existing.earnings += row.daily_earnings || 0;
    byDate.set(row.date, existing);
  }

  // Convert to table rows
  const rows = Array.from(byDate.entries()).map(([date, stats]) => [
    date,
    stats.count.toString(),
    formatCurrencyFull(stats.earnings),
  ]);

  return {
    type: "table",
    tableData: {
      headers: ["Date", "Workers", "Earnings"],
      rows,
    },
    dateRange:
      filters.date_from && filters.date_to
        ? { from: filters.date_from, to: filters.date_to }
        : undefined,
  };
}

// ============================================================================
// Expense Queries
// ============================================================================

async function queryTotalSpending(filters: IntentFilters): Promise<QueryResult> {
  const supabase = createClient();

  // Use v_all_expenses view which combines all expense sources
  let query = supabase.from("v_all_expenses").select("amount");

  if (filters.site_id) {
    query = query.eq("site_id", filters.site_id);
  }

  if (filters.date_from) {
    query = query.gte("date", filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte("date", filters.date_to);
  }

  const { data, error } = await query;

  if (error) {
    console.error("queryTotalSpending error:", error);
    throw error;
  }

  const total = (data || []).reduce((sum, row) => sum + (row.amount || 0), 0);

  return {
    type: total > 0 ? "value" : "empty",
    value: total,
    label: "Total spending",
    dateRange:
      filters.date_from && filters.date_to
        ? { from: filters.date_from, to: filters.date_to }
        : undefined,
  };
}

async function queryExpenseTotal(filters: IntentFilters): Promise<QueryResult> {
  const supabase = createClient();

  // Use v_all_expenses view which has proper access and combines all expense sources
  let query = supabase.from("v_all_expenses").select("amount");

  if (filters.site_id) {
    query = query.eq("site_id", filters.site_id);
  }

  if (filters.date_from) {
    query = query.gte("date", filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte("date", filters.date_to);
  }

  const { data, error } = await query;

  if (error) {
    console.error("queryExpenseTotal error:", error);
    throw error;
  }

  const total = (data || []).reduce((sum, row) => sum + (row.amount || 0), 0);

  return {
    type: total > 0 ? "value" : "empty",
    value: total,
    label: "Total expenses",
    dateRange:
      filters.date_from && filters.date_to
        ? { from: filters.date_from, to: filters.date_to }
        : undefined,
  };
}

async function queryExpenseByCategory(filters: IntentFilters): Promise<QueryResult> {
  const supabase = createClient();

  // Use v_all_expenses view which has category_name already joined
  let query = supabase.from("v_all_expenses").select("amount, category_name");

  if (filters.site_id) {
    query = query.eq("site_id", filters.site_id);
  }

  if (filters.date_from) {
    query = query.gte("date", filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte("date", filters.date_to);
  }

  const { data, error } = await query;

  if (error) {
    console.error("queryExpenseByCategory error:", error);
    throw error;
  }

  if (!data || data.length === 0) {
    return { type: "empty" };
  }

  // Group by category
  const byCategory = new Map<string, number>();
  for (const row of data) {
    const categoryName = row.category_name || "Other";
    const existing = byCategory.get(categoryName) || 0;
    byCategory.set(categoryName, existing + (row.amount || 0));
  }

  // Sort by amount descending
  const sorted = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]);

  const rows = sorted.map(([category, amount]) => [
    category,
    formatCurrencyFull(amount),
  ]);

  return {
    type: "table",
    tableData: {
      headers: ["Category", "Amount"],
      rows,
    },
    dateRange:
      filters.date_from && filters.date_to
        ? { from: filters.date_from, to: filters.date_to }
        : undefined,
  };
}

// ============================================================================
// Module-Specific Expense Queries
// ============================================================================

async function queryMaterialExpenses(filters: IntentFilters): Promise<QueryResult> {
  const supabase = createClient();

  // Filter v_all_expenses by module = 'material'
  let query = supabase
    .from("v_all_expenses")
    .select("amount")
    .eq("module", "material");

  if (filters.site_id) {
    query = query.eq("site_id", filters.site_id);
  }

  if (filters.date_from) {
    query = query.gte("date", filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte("date", filters.date_to);
  }

  const { data, error } = await query;

  if (error) {
    console.error("queryMaterialExpenses error:", error);
    throw error;
  }

  const total = (data || []).reduce((sum, row) => sum + (row.amount || 0), 0);

  return {
    type: total > 0 ? "value" : "empty",
    value: total,
    label: "Material expenses",
    dateRange:
      filters.date_from && filters.date_to
        ? { from: filters.date_from, to: filters.date_to }
        : undefined,
  };
}

async function queryLaborExpenses(filters: IntentFilters): Promise<QueryResult> {
  const supabase = createClient();

  // Filter v_all_expenses by module = 'labor'
  let query = supabase
    .from("v_all_expenses")
    .select("amount")
    .eq("module", "labor");

  if (filters.site_id) {
    query = query.eq("site_id", filters.site_id);
  }

  if (filters.date_from) {
    query = query.gte("date", filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte("date", filters.date_to);
  }

  const { data, error } = await query;

  if (error) {
    console.error("queryLaborExpenses error:", error);
    throw error;
  }

  const total = (data || []).reduce((sum, row) => sum + (row.amount || 0), 0);

  return {
    type: total > 0 ? "value" : "empty",
    value: total,
    label: "Labor expenses",
    dateRange:
      filters.date_from && filters.date_to
        ? { from: filters.date_from, to: filters.date_to }
        : undefined,
  };
}

async function queryMachineryExpenses(filters: IntentFilters): Promise<QueryResult> {
  const supabase = createClient();

  // Filter v_all_expenses by module = 'machinery'
  let query = supabase
    .from("v_all_expenses")
    .select("amount")
    .eq("module", "machinery");

  if (filters.site_id) {
    query = query.eq("site_id", filters.site_id);
  }

  if (filters.date_from) {
    query = query.gte("date", filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte("date", filters.date_to);
  }

  const { data, error } = await query;

  if (error) {
    console.error("queryMachineryExpenses error:", error);
    throw error;
  }

  const total = (data || []).reduce((sum, row) => sum + (row.amount || 0), 0);

  return {
    type: total > 0 ? "value" : "empty",
    value: total,
    label: "Machinery expenses",
    dateRange:
      filters.date_from && filters.date_to
        ? { from: filters.date_from, to: filters.date_to }
        : undefined,
  };
}

// ============================================================================
// Advance Queries
// ============================================================================

async function queryAdvanceTotal(filters: IntentFilters): Promise<QueryResult> {
  const supabase = createClient();

  let query = supabase
    .from("advances")
    .select("amount")
    .eq("transaction_type", "advance")
    .eq("is_deleted", false);

  if (filters.date_from) {
    query = query.gte("date", filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte("date", filters.date_to);
  }

  const { data, error } = await query;

  if (error) throw error;

  const total = (data || []).reduce((sum, row) => sum + (row.amount || 0), 0);

  return {
    type: total > 0 ? "value" : "empty",
    value: total,
    label: "Total advances",
    dateRange:
      filters.date_from && filters.date_to
        ? { from: filters.date_from, to: filters.date_to }
        : undefined,
  };
}

async function queryAdvancePending(filters: IntentFilters): Promise<QueryResult> {
  const supabase = createClient();

  let query = supabase
    .from("advances")
    .select("amount, deducted_amount")
    .eq("transaction_type", "advance")
    .in("deduction_status", ["pending", "partial"])
    .eq("is_deleted", false);

  if (filters.date_from) {
    query = query.gte("date", filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte("date", filters.date_to);
  }

  const { data, error } = await query;

  if (error) throw error;

  // Calculate pending = amount - deducted_amount
  const total = (data || []).reduce(
    (sum, row) => sum + ((row.amount || 0) - (row.deducted_amount || 0)),
    0
  );

  return {
    type: total > 0 ? "value" : "empty",
    value: total,
    label: "Pending advances",
    dateRange:
      filters.date_from && filters.date_to
        ? { from: filters.date_from, to: filters.date_to }
        : undefined,
  };
}

// ============================================================================
// Contract Queries
// ============================================================================

async function queryContractSummary(filters: IntentFilters): Promise<QueryResult> {
  const supabase = createClient();

  let query = supabase
    .from("subcontracts")
    .select("title, contract_type, status, total_value");

  if (filters.site_id) {
    query = query.eq("site_id", filters.site_id);
  }

  if (filters.status) {
    query = query.eq("status", filters.status as "active" | "completed" | "draft" | "cancelled" | "on_hold");
  } else {
    // Default to active contracts
    query = query.eq("status", "active");
  }

  const { data, error } = await query;

  if (error) throw error;

  if (!data || data.length === 0) {
    return { type: "empty", label: "No active contracts found" };
  }

  const rows = data.map((contract) => [
    contract.title || "Untitled",
    contract.contract_type || "-",
    contract.status || "-",
    formatCurrencyFull(contract.total_value || 0),
  ]);

  return {
    type: "table",
    tableData: {
      headers: ["Title", "Type", "Status", "Value"],
      rows,
    },
  };
}

async function queryContractPaymentsTotal(
  filters: IntentFilters
): Promise<QueryResult> {
  const supabase = createClient();

  // Contract payments are tracked in settlement_groups
  let query = supabase
    .from("settlement_groups")
    .select("total_amount")
    .not("subcontract_id", "is", null)
    .eq("is_cancelled", false);

  if (filters.site_id) {
    query = query.eq("site_id", filters.site_id);
  }

  if (filters.date_from) {
    query = query.gte("settlement_date", filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte("settlement_date", filters.date_to);
  }

  const { data, error } = await query;

  if (error) throw error;

  const total = (data || []).reduce((sum, row) => sum + (row.total_amount || 0), 0);

  return {
    type: total > 0 ? "value" : "empty",
    value: total,
    label: "Contract payments",
    dateRange:
      filters.date_from && filters.date_to
        ? { from: filters.date_from, to: filters.date_to }
        : undefined,
  };
}

// ============================================================================
// Laborer Queries
// ============================================================================

async function queryLaborerCount(filters: IntentFilters): Promise<QueryResult> {
  const supabase = createClient();

  let query = supabase
    .from("laborers")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  if (filters.site_id) {
    query = query.eq("site_id", filters.site_id);
  }

  const { count, error } = await query;

  if (error) throw error;

  return {
    type: (count || 0) > 0 ? "value" : "empty",
    value: count || 0,
    label: "active workers",
  };
}

async function queryLaborerByCategory(filters: IntentFilters): Promise<QueryResult> {
  const supabase = createClient();

  let query = supabase
    .from("laborers")
    .select("id, labor_categories(name)")
    .eq("status", "active");

  if (filters.site_id) {
    query = query.eq("site_id", filters.site_id);
  }

  if (filters.category) {
    // Filter by specific category
    query = query.ilike("labor_categories.name", `%${filters.category}%`);
  }

  const { data, error } = await query;

  if (error) throw error;

  if (!data || data.length === 0) {
    return { type: "empty" };
  }

  // Group by category
  const byCategory = new Map<string, number>();
  for (const row of data) {
    const categoryName =
      (row.labor_categories as { name: string } | null)?.name || "Other";
    const existing = byCategory.get(categoryName) || 0;
    byCategory.set(categoryName, existing + 1);
  }

  // Sort by count descending
  const sorted = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]);

  const rows = sorted.map(([category, count]) => [category, count.toString()]);

  return {
    type: "table",
    tableData: {
      headers: ["Category", "Count"],
      rows,
    },
  };
}

async function queryLaborerEarnings(filters: IntentFilters): Promise<QueryResult> {
  const supabase = createClient();

  let query = supabase
    .from("daily_attendance")
    .select("laborer_id, daily_earnings, laborers!daily_attendance_laborer_id_fkey(name)")
    .eq("is_deleted", false);

  if (filters.site_id) {
    query = query.eq("site_id", filters.site_id);
  }

  if (filters.date_from) {
    query = query.gte("date", filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte("date", filters.date_to);
  }

  const { data, error } = await query;

  if (error) throw error;

  if (!data || data.length === 0) {
    return { type: "empty" };
  }

  // Group by laborer
  const byLaborer = new Map<string, { name: string; earnings: number }>();
  for (const row of data) {
    const laborerId = row.laborer_id;
    const laborerName = (row.laborers as { name: string } | null)?.name || "Unknown";
    const existing = byLaborer.get(laborerId) || { name: laborerName, earnings: 0 };
    existing.earnings += row.daily_earnings || 0;
    byLaborer.set(laborerId, existing);
  }

  // Sort by earnings descending
  const sorted = Array.from(byLaborer.values()).sort(
    (a, b) => b.earnings - a.earnings
  );

  // Limit to top N (default 10)
  const limit = filters.limit || 10;
  const topEarners = sorted.slice(0, limit);

  const rows = topEarners.map((laborer) => [
    laborer.name,
    formatCurrencyFull(laborer.earnings),
  ]);

  return {
    type: "table",
    tableData: {
      headers: ["Worker", "Earnings"],
      rows,
    },
    dateRange:
      filters.date_from && filters.date_to
        ? { from: filters.date_from, to: filters.date_to }
        : undefined,
  };
}

// ============================================================================
// Tea Shop Queries
// ============================================================================

async function queryTeaShopBalance(filters: IntentFilters): Promise<QueryResult> {
  const supabase = createClient();

  // Get total entries (entries that are not fully paid)
  let entriesQuery = supabase
    .from("tea_shop_entries")
    .select("total_amount, amount_paid")
    .eq("is_fully_paid", false);

  if (filters.site_id) {
    entriesQuery = entriesQuery.eq("site_id", filters.site_id);
  }

  // Get total settlements
  let settlementsQuery = supabase
    .from("tea_shop_settlements")
    .select("amount_paid");

  const [entriesResult, settlementsResult] = await Promise.all([
    entriesQuery,
    settlementsQuery,
  ]);

  if (entriesResult.error) throw entriesResult.error;
  if (settlementsResult.error) throw settlementsResult.error;

  // Calculate pending balance from entries (total_amount - amount_paid for each entry)
  const pendingBalance = (entriesResult.data || []).reduce(
    (sum, e) => sum + ((e.total_amount || 0) - (e.amount_paid || 0)),
    0
  );

  const balance = pendingBalance;

  return {
    type: "value",
    value: balance,
    label: "Tea shop pending balance",
  };
}

// ============================================================================
// Team Queries
// ============================================================================

async function queryTeamSummary(filters: IntentFilters): Promise<QueryResult> {
  const supabase = createClient();

  // Get teams
  const teamsQuery = supabase
    .from("teams")
    .select("id, name, leader_name, status")
    .eq("status", "active");

  const { data: teams, error: teamsError } = await teamsQuery;

  if (teamsError) throw teamsError;

  if (!teams || teams.length === 0) {
    return { type: "empty", label: "No active teams found" };
  }

  // Get laborer counts per team
  const laborerQuery = supabase
    .from("laborers")
    .select("team_id")
    .eq("status", "active")
    .not("team_id", "is", null);

  const { data: laborers, error: laborerError } = await laborerQuery;

  if (laborerError) throw laborerError;

  // Count laborers per team
  const laborerCounts = new Map<string, number>();
  for (const l of laborers || []) {
    if (!l.team_id) continue;
    const count = laborerCounts.get(l.team_id) || 0;
    laborerCounts.set(l.team_id, count + 1);
  }

  const rows = teams.map((team) => [
    team.name || "-",
    team.leader_name || "-",
    (laborerCounts.get(team.id) || 0).toString(),
  ]);

  return {
    type: "table",
    tableData: {
      headers: ["Team", "Leader", "Members"],
      rows,
    },
  };
}

// ============================================================================
// Daily Cost Query
// ============================================================================

async function queryDailyCost(filters: IntentFilters): Promise<QueryResult> {
  const supabase = createClient();

  // Get attendance earnings for the date
  let attendanceQuery = supabase
    .from("daily_attendance")
    .select("daily_earnings")
    .eq("is_deleted", false);

  if (filters.site_id) {
    attendanceQuery = attendanceQuery.eq("site_id", filters.site_id);
  }

  if (filters.date_from) {
    attendanceQuery = attendanceQuery.eq("date", filters.date_from);
  }

  // Get expenses for the date
  let expenseQuery = supabase
    .from("expenses")
    .select("amount")
    .eq("is_deleted", false);

  if (filters.site_id) {
    expenseQuery = expenseQuery.eq("site_id", filters.site_id);
  }

  if (filters.date_from) {
    expenseQuery = expenseQuery.eq("date", filters.date_from);
  }

  const [attendanceResult, expenseResult] = await Promise.all([
    attendanceQuery,
    expenseQuery,
  ]);

  if (attendanceResult.error) throw attendanceResult.error;
  if (expenseResult.error) throw expenseResult.error;

  const laborCost = (attendanceResult.data || []).reduce(
    (sum, r) => sum + (r.daily_earnings || 0),
    0
  );
  const expenseCost = (expenseResult.data || []).reduce(
    (sum, r) => sum + (r.amount || 0),
    0
  );
  const totalCost = laborCost + expenseCost;

  return {
    type: "table",
    tableData: {
      headers: ["Category", "Amount"],
      rows: [
        ["Labor Cost", formatCurrencyFull(laborCost)],
        ["Expenses", formatCurrencyFull(expenseCost)],
        ["Total", formatCurrencyFull(totalCost)],
      ],
    },
    dateRange: filters.date_from
      ? { from: filters.date_from, to: filters.date_from }
      : undefined,
  };
}

// ============================================================================
// Holiday List Query
// ============================================================================

async function queryHolidayList(filters: IntentFilters): Promise<QueryResult> {
  const supabase = createClient();

  let query = supabase.from("site_holidays").select("date, reason");

  if (filters.site_id) {
    query = query.eq("site_id", filters.site_id);
  }

  if (filters.date_from) {
    query = query.gte("date", filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte("date", filters.date_to);
  }

  query = query.order("date", { ascending: true });

  const { data, error } = await query;

  if (error) throw error;

  if (!data || data.length === 0) {
    return { type: "empty", label: "No holidays found" };
  }

  const rows = data.map((h) => [h.date, h.reason || "-"]);

  return {
    type: "table",
    tableData: {
      headers: ["Date", "Reason"],
      rows,
    },
    dateRange:
      filters.date_from && filters.date_to
        ? { from: filters.date_from, to: filters.date_to }
        : undefined,
  };
}

// ============================================================================
// Work Days Summary (Overtime) Query
// ============================================================================

async function queryWorkDaysSummary(filters: IntentFilters): Promise<QueryResult> {
  const supabase = createClient();

  let query = supabase
    .from("daily_attendance")
    .select("date, work_days, daily_earnings, laborers!daily_attendance_laborer_id_fkey(name)")
    .eq("is_deleted", false)
    .gt("work_days", 1); // Overtime: more than 1 day

  if (filters.site_id) {
    query = query.eq("site_id", filters.site_id);
  }

  if (filters.date_from) {
    query = query.gte("date", filters.date_from);
  }
  if (filters.date_to) {
    query = query.lte("date", filters.date_to);
  }

  query = query.order("date", { ascending: false }).limit(50);

  const { data, error } = await query;

  if (error) throw error;

  if (!data || data.length === 0) {
    return { type: "empty", label: "No overtime records found" };
  }

  const rows = data.map((r) => [
    r.date,
    (r.laborers as { name: string } | null)?.name || "Unknown",
    r.work_days?.toString() || "-",
    formatCurrencyFull(r.daily_earnings || 0),
  ]);

  return {
    type: "table",
    tableData: {
      headers: ["Date", "Worker", "Days", "Earnings"],
      rows,
    },
    dateRange:
      filters.date_from && filters.date_to
        ? { from: filters.date_from, to: filters.date_to }
        : undefined,
  };
}

// ============================================================================
// Execute Query Function
// ============================================================================

export async function executeQuery(
  intent: string,
  filters: IntentFilters
): Promise<QueryResult> {
  const queryFn = QUERY_REGISTRY[intent];

  if (!queryFn) {
    return {
      type: "empty",
      label: "Unknown query type",
    };
  }

  try {
    return await queryFn(filters);
  } catch (error) {
    console.error(`Query error for intent ${intent}:`, error);
    throw error;
  }
}
