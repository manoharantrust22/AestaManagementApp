/**
 * AESTA Chat Tools
 * 34 Groq function-calling tool definitions + server-side Supabase executors.
 * All executors accept a server-side Supabase client (RLS applies).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

type DbClient = SupabaseClient<Database>;

// ============================================================================
// Tool Definitions (OpenAI / Groq format)
// ============================================================================

export const TOOL_DEFINITIONS = [
  // --- Attendance ---
  {
    type: "function" as const,
    function: {
      name: "get_attendance_count",
      description: "Get how many workers attended work on a specific site for a date range.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string", description: "The site UUID" },
          date_from: { type: "string", description: "Start date YYYY-MM-DD" },
          date_to: { type: "string", description: "End date YYYY-MM-DD" },
        },
        required: ["site_id", "date_from", "date_to"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_attendance_list",
      description: "Get the list of workers who came to work, with names and day-type (full/half), for a date range.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["site_id", "date_from", "date_to"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_laborer_attendance",
      description: "Get the attendance record for a specific worker by name.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
          laborer_name: { type: "string", description: "Partial or full name of the worker" },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["site_id", "laborer_name", "date_from", "date_to"],
      },
    },
  },
  // --- Salary ---
  {
    type: "function" as const,
    function: {
      name: "get_total_salary",
      description: "Get the total salary bill (net payable) for a site in a date range.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["site_id", "date_from", "date_to"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_salary_paid",
      description: "Get the total salary amount already paid out for a site in a date range.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["site_id", "date_from", "date_to"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_salary_pending",
      description: "Get the total unpaid (pending) salary balance for a site.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["site_id", "date_from", "date_to"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_top_earners",
      description: "Get the top earning workers on a site ranked by total earnings.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
          limit: { type: "number", description: "How many top earners to return (default 5)" },
        },
        required: ["site_id", "date_from", "date_to"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_laborer_earnings",
      description: "Get total earnings for a specific worker by name.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
          laborer_name: { type: "string" },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["site_id", "laborer_name", "date_from", "date_to"],
      },
    },
  },
  // --- Expenses ---
  {
    type: "function" as const,
    function: {
      name: "get_total_expenses",
      description: "Get total expenses (all categories) for a site in a date range.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["site_id", "date_from", "date_to"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_expenses_by_category",
      description: "Get expenses broken down by category (material, labour, machinery) for a site.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["site_id", "date_from", "date_to"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_daily_cost",
      description: "Get day-by-day expense totals for a site.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["site_id", "date_from", "date_to"],
      },
    },
  },
  // --- Advances ---
  {
    type: "function" as const,
    function: {
      name: "get_total_advances",
      description: "Get total advances given to workers on a site in a date range.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["site_id", "date_from", "date_to"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_pending_advances",
      description: "Get the list of outstanding (unsettled) advances on a site.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
        },
        required: ["site_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_laborer_advance",
      description: "Get outstanding advance balance for a specific worker by name.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
          laborer_name: { type: "string" },
        },
        required: ["site_id", "laborer_name"],
      },
    },
  },
  // --- Materials & Inventory ---
  {
    type: "function" as const,
    function: {
      name: "get_material_stock",
      description: "Get current stock levels for materials on a site. Optionally filter by material name.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
          material_name: { type: "string", description: "Optional: partial material name to filter (e.g. 'cement')" },
        },
        required: ["site_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_pending_purchase_orders",
      description: "Get purchase orders that are pending or partially delivered on a site.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
        },
        required: ["site_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_recent_deliveries",
      description: "Get materials recently delivered to a site in a date range.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["site_id", "date_from", "date_to"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_material_usage",
      description: "Get how much of a material was consumed/issued from inventory on a site.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
          material_name: { type: "string", description: "Optional: filter by material name (e.g. 'cement')" },
        },
        required: ["site_id", "date_from", "date_to"],
      },
    },
  },
  // --- Rentals & Equipment ---
  {
    type: "function" as const,
    function: {
      name: "get_active_rentals",
      description: "Get currently active rental orders on a site.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
        },
        required: ["site_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_rental_cost",
      description: "Get total rental expense for a site in a date range.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["site_id", "date_from", "date_to"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_equipment_status",
      description: "Get equipment currently deployed or assigned to a site.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
        },
        required: ["site_id"],
      },
    },
  },
  // --- Contracts & Settlements ---
  {
    type: "function" as const,
    function: {
      name: "get_contract_summary",
      description: "Get subcontract value and payment status for a site.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
        },
        required: ["site_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_client_payments",
      description: "Get client payments received for a site.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["site_id", "date_from", "date_to"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_settlement_status",
      description: "Get mesthri salary settlement groups and their paid/pending status.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["site_id", "date_from", "date_to"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_settlement_history",
      description: "Get total salary settled via settlement groups in a date range.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["site_id", "date_from", "date_to"],
      },
    },
  },
  // --- Tea Shop ---
  {
    type: "function" as const,
    function: {
      name: "get_tea_shop_balance",
      description: "Get the current tea shop credit/debit balance for a site.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
        },
        required: ["site_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_tea_shop_entries",
      description: "Get tea shop entry records for a site in a date range.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["site_id", "date_from", "date_to"],
      },
    },
  },
  // --- Laborers & Teams ---
  {
    type: "function" as const,
    function: {
      name: "get_laborer_count",
      description: "Get the total number of active laborers on a site.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
        },
        required: ["site_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_laborers_by_category",
      description: "Get a breakdown of active laborers by job category (mason, helper, carpenter, etc).",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
        },
        required: ["site_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_team_list",
      description: "Get all teams on a site with their leaders.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
        },
        required: ["site_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_team_members",
      description: "Get the members of a specific team by team name.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
          team_name: { type: "string", description: "Partial or full team name" },
        },
        required: ["site_id", "team_name"],
      },
    },
  },
  // --- Cross-site ---
  {
    type: "function" as const,
    function: {
      name: "get_cross_site_expenses",
      description: "Compare total expenses across all sites in the company for a date range.",
      parameters: {
        type: "object",
        properties: {
          company_id: { type: "string" },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["company_id", "date_from", "date_to"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_cross_site_attendance",
      description: "Compare worker attendance counts across all sites in the company.",
      parameters: {
        type: "object",
        properties: {
          company_id: { type: "string" },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["company_id", "date_from", "date_to"],
      },
    },
  },
  // --- Misc ---
  {
    type: "function" as const,
    function: {
      name: "get_holiday_list",
      description: "Get the list of holidays for a site in a date range.",
      parameters: {
        type: "object",
        properties: {
          site_id: { type: "string" },
          date_from: { type: "string", description: "YYYY-MM-DD" },
          date_to: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["site_id", "date_from", "date_to"],
      },
    },
  },
];

// ============================================================================
// Tool Executor Dispatcher
// ============================================================================

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  supabase: DbClient
): Promise<string> {
  try {
    switch (toolName) {
      case "get_attendance_count":       return await execGetAttendanceCount(args, supabase);
      case "get_attendance_list":        return await execGetAttendanceList(args, supabase);
      case "get_laborer_attendance":     return await execGetLaborerAttendance(args, supabase);
      case "get_total_salary":           return await execGetTotalSalary(args, supabase);
      case "get_salary_paid":            return await execGetSalaryPaid(args, supabase);
      case "get_salary_pending":         return await execGetSalaryPending(args, supabase);
      case "get_top_earners":            return await execGetTopEarners(args, supabase);
      case "get_laborer_earnings":       return await execGetLaborerEarnings(args, supabase);
      case "get_total_expenses":         return await execGetTotalExpenses(args, supabase);
      case "get_expenses_by_category":   return await execGetExpensesByCategory(args, supabase);
      case "get_daily_cost":             return await execGetDailyCost(args, supabase);
      case "get_total_advances":         return await execGetTotalAdvances(args, supabase);
      case "get_pending_advances":       return await execGetPendingAdvances(args, supabase);
      case "get_laborer_advance":        return await execGetLaborerAdvance(args, supabase);
      case "get_material_stock":         return await execGetMaterialStock(args, supabase);
      case "get_pending_purchase_orders":return await execGetPendingPurchaseOrders(args, supabase);
      case "get_recent_deliveries":      return await execGetRecentDeliveries(args, supabase);
      case "get_material_usage":         return await execGetMaterialUsage(args, supabase);
      case "get_active_rentals":         return await execGetActiveRentals(args, supabase);
      case "get_rental_cost":            return await execGetRentalCost(args, supabase);
      case "get_equipment_status":       return await execGetEquipmentStatus(args, supabase);
      case "get_contract_summary":       return await execGetContractSummary(args, supabase);
      case "get_client_payments":        return await execGetClientPayments(args, supabase);
      case "get_settlement_status":      return await execGetSettlementStatus(args, supabase);
      case "get_settlement_history":     return await execGetSettlementHistory(args, supabase);
      case "get_tea_shop_balance":       return await execGetTeaShopBalance(args, supabase);
      case "get_tea_shop_entries":       return await execGetTeaShopEntries(args, supabase);
      case "get_laborer_count":          return await execGetLaborerCount(args, supabase);
      case "get_laborers_by_category":   return await execGetLaborersByCategory(args, supabase);
      case "get_team_list":              return await execGetTeamList(args, supabase);
      case "get_team_members":           return await execGetTeamMembers(args, supabase);
      case "get_cross_site_expenses":    return await execGetCrossSiteExpenses(args, supabase);
      case "get_cross_site_attendance":  return await execGetCrossSiteAttendance(args, supabase);
      case "get_holiday_list":           return await execGetHolidayList(args, supabase);
      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: message });
  }
}

// ============================================================================
// Helper: find laborer IDs by name (partial match)
// ============================================================================

async function findLaborerIds(
  supabase: DbClient,
  site_id: string,
  laborer_name: string
): Promise<{ ids: string[]; names: string[] }> {
  const { data } = await supabase
    .from("laborers")
    .select("id, name")
    .ilike("name", `%${laborer_name}%`);
  return {
    ids: data?.map((l) => l.id) ?? [],
    names: data?.map((l) => l.name) ?? [],
  };
}

// Get laborer IDs who have worked at a site (via attendance records)
async function getSiteLaborerIds(
  supabase: DbClient,
  site_id: string
): Promise<string[]> {
  const { data } = await supabase
    .from("daily_attendance")
    .select("laborer_id")
    .eq("site_id", site_id)
    .eq("is_deleted", false);
  return [...new Set(data?.map((r) => r.laborer_id) ?? [])];
}

// ============================================================================
// Attendance executors
// ============================================================================

async function execGetAttendanceCount(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, date_from, date_to } = args as Record<string, string>;
  const { data, error } = await supabase
    .from("daily_attendance")
    .select("laborer_id")
    .eq("is_deleted", false)
    .eq("site_id", site_id)
    .gte("date", date_from)
    .lte("date", date_to);
  if (error) return JSON.stringify({ error: error.message });
  const unique = new Set(data?.map((r) => r.laborer_id));
  return JSON.stringify({ workers_present: unique.size, date_from, date_to });
}

async function execGetAttendanceList(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, date_from, date_to } = args as Record<string, string>;
  const { data, error } = await supabase
    .from("daily_attendance")
    .select("date, day_units, daily_earnings, laborer_id, laborers!daily_attendance_laborer_id_fkey(name)")
    .eq("is_deleted", false)
    .eq("site_id", site_id)
    .gte("date", date_from)
    .lte("date", date_to)
    .order("date", { ascending: true });
  if (error) return JSON.stringify({ error: error.message });
  const records = (data ?? []).map((r) => ({
    date: r.date,
    name: (r.laborers as any)?.name ?? "Unknown",
    day_type: r.day_units === 1 ? "full" : "half",
    earnings: r.daily_earnings,
  }));
  return JSON.stringify({ records, total: records.length });
}

async function execGetLaborerAttendance(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, laborer_name, date_from, date_to } = args as Record<string, string>;
  const { ids, names } = await findLaborerIds(supabase, site_id, laborer_name);
  if (!ids.length) return JSON.stringify({ error: `No laborer found matching "${laborer_name}"` });
  const { data, error } = await supabase
    .from("daily_attendance")
    .select("date, day_units, daily_earnings")
    .eq("is_deleted", false)
    .eq("site_id", site_id)
    .in("laborer_id", ids)
    .gte("date", date_from)
    .lte("date", date_to);
  if (error) return JSON.stringify({ error: error.message });
  const total_days = (data ?? []).reduce((s, r) => s + (r.day_units ?? 0), 0);
  const total_earnings = (data ?? []).reduce((s, r) => s + (r.daily_earnings ?? 0), 0);
  return JSON.stringify({ laborer_name: names[0], records: data, total_days, total_earnings });
}

// ============================================================================
// Salary executors
// ============================================================================

async function execGetTotalSalary(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, date_from, date_to } = args as Record<string, string>;
  const ids = await getSiteLaborerIds(supabase, site_id);
  if (!ids.length) return JSON.stringify({ total_salary: 0 });
  const { data, error } = await supabase
    .from("salary_periods")
    .select("net_payable")
    .in("laborer_id", ids)
    .gte("week_ending", date_from)
    .lte("week_ending", date_to);
  if (error) return JSON.stringify({ error: error.message });
  const total = (data ?? []).reduce((s, r) => s + (r.net_payable ?? 0), 0);
  return JSON.stringify({ total_salary: total, date_from, date_to });
}

async function execGetSalaryPaid(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, date_from, date_to } = args as Record<string, string>;
  const laborerIds = await getSiteLaborerIds(supabase, site_id);
  if (!laborerIds.length) return JSON.stringify({ salary_paid: 0 });
  // Get salary period IDs for these laborers in the date range
  const { data: periods } = await supabase
    .from("salary_periods")
    .select("id")
    .in("laborer_id", laborerIds)
    .gte("week_ending", date_from)
    .lte("week_ending", date_to);
  const periodIds = periods?.map((p) => p.id) ?? [];
  if (!periodIds.length) return JSON.stringify({ salary_paid: 0 });
  const { data, error } = await supabase
    .from("salary_payments")
    .select("amount")
    .in("salary_period_id", periodIds);
  if (error) return JSON.stringify({ error: error.message });
  const total = (data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
  return JSON.stringify({ salary_paid: total, date_from, date_to });
}

async function execGetSalaryPending(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, date_from, date_to } = args as Record<string, string>;
  const ids = await getSiteLaborerIds(supabase, site_id);
  if (!ids.length) return JSON.stringify({ salary_pending: 0 });
  const { data, error } = await supabase
    .from("salary_periods")
    .select("balance_due")
    .in("laborer_id", ids)
    .neq("status", "paid")
    .gte("week_ending", date_from)
    .lte("week_ending", date_to);
  if (error) return JSON.stringify({ error: error.message });
  const total = (data ?? []).reduce((s, r) => s + (r.balance_due ?? 0), 0);
  return JSON.stringify({ salary_pending: total });
}

async function execGetTopEarners(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, date_from, date_to, limit = 5 } = args as Record<string, unknown>;
  const { data, error } = await supabase
    .from("daily_attendance")
    .select("laborer_id, daily_earnings, laborers!daily_attendance_laborer_id_fkey(name)")
    .eq("is_deleted", false)
    .eq("site_id", site_id as string)
    .gte("date", date_from as string)
    .lte("date", date_to as string);
  if (error) return JSON.stringify({ error: error.message });
  const byLaborer = new Map<string, { name: string; total: number }>();
  for (const r of data ?? []) {
    const name = (r.laborers as any)?.name ?? r.laborer_id;
    const existing = byLaborer.get(r.laborer_id) ?? { name, total: 0 };
    existing.total += r.daily_earnings ?? 0;
    byLaborer.set(r.laborer_id, existing);
  }
  const sorted = Array.from(byLaborer.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, Number(limit));
  return JSON.stringify({ top_earners: sorted });
}

async function execGetLaborerEarnings(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, laborer_name, date_from, date_to } = args as Record<string, string>;
  const { ids, names } = await findLaborerIds(supabase, site_id, laborer_name);
  if (!ids.length) return JSON.stringify({ error: `No laborer found matching "${laborer_name}"` });
  const { data, error } = await supabase
    .from("daily_attendance")
    .select("daily_earnings, date")
    .eq("is_deleted", false)
    .eq("site_id", site_id)
    .in("laborer_id", ids)
    .gte("date", date_from)
    .lte("date", date_to);
  if (error) return JSON.stringify({ error: error.message });
  const total = (data ?? []).reduce((s, r) => s + (r.daily_earnings ?? 0), 0);
  return JSON.stringify({ laborer_name: names[0], total_earnings: total, days_worked: data?.length ?? 0 });
}

// ============================================================================
// Expense executors
// ============================================================================

async function execGetTotalExpenses(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, date_from, date_to } = args as Record<string, string>;
  const { data, error } = await supabase
    .from("v_all_expenses")
    .select("amount")
    .eq("site_id", site_id)
    .gte("date", date_from)
    .lte("date", date_to);
  if (error) return JSON.stringify({ error: error.message });
  const total = (data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
  return JSON.stringify({ total_expenses: total, date_from, date_to });
}

async function execGetExpensesByCategory(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, date_from, date_to } = args as Record<string, string>;
  const { data, error } = await supabase
    .from("v_all_expenses")
    .select("amount, module")
    .eq("site_id", site_id)
    .gte("date", date_from)
    .lte("date", date_to);
  if (error) return JSON.stringify({ error: error.message });
  const byCategory: Record<string, number> = {};
  for (const r of data ?? []) {
    const cat = r.module ?? "other";
    byCategory[cat] = (byCategory[cat] ?? 0) + (r.amount ?? 0);
  }
  return JSON.stringify({ by_category: byCategory, date_from, date_to });
}

async function execGetDailyCost(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, date_from, date_to } = args as Record<string, string>;
  const { data, error } = await supabase
    .from("v_all_expenses")
    .select("amount, date")
    .eq("site_id", site_id)
    .gte("date", date_from)
    .lte("date", date_to)
    .order("date");
  if (error) return JSON.stringify({ error: error.message });
  const byDate: Record<string, number> = {};
  for (const r of data ?? []) {
    if (r.date) {
      byDate[r.date] = (byDate[r.date] ?? 0) + (r.amount ?? 0);
    }
  }
  const rows = Object.entries(byDate).map(([date, total]) => ({ date, total }));
  return JSON.stringify({ daily_costs: rows });
}

// ============================================================================
// Advance executors
// ============================================================================

async function execGetTotalAdvances(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, date_from, date_to } = args as Record<string, string>;
  const laborerIds = await getSiteLaborerIds(supabase, site_id);
  if (!laborerIds.length) return JSON.stringify({ total_advances: 0, count: 0 });
  const { data, error } = await supabase
    .from("advances")
    .select("amount")
    .in("laborer_id", laborerIds)
    .eq("transaction_type", "advance")
    .eq("is_deleted", false)
    .gte("date", date_from)
    .lte("date", date_to);
  if (error) return JSON.stringify({ error: error.message });
  const total = (data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
  return JSON.stringify({ total_advances: total, count: data?.length ?? 0 });
}

async function execGetPendingAdvances(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id } = args as Record<string, string>;
  const laborerIds = await getSiteLaborerIds(supabase, site_id);
  if (!laborerIds.length) return JSON.stringify({ pending_advances: [], total_pending: 0 });
  const { data, error } = await supabase
    .from("advances")
    .select("amount, date, laborer_id, laborers(name)")
    .in("laborer_id", laborerIds)
    .eq("transaction_type", "advance")
    .eq("is_deleted", false)
    .in("deduction_status", ["pending", "partial"])
    .order("date", { ascending: false });
  if (error) return JSON.stringify({ error: error.message });
  const records = (data ?? []).map((r) => ({
    laborer: (r.laborers as any)?.name ?? "Unknown",
    amount: r.amount,
    date: r.date,
  }));
  const total = records.reduce((s, r) => s + (r.amount ?? 0), 0);
  return JSON.stringify({ pending_advances: records, total_pending: total });
}

async function execGetLaborerAdvance(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, laborer_name } = args as Record<string, string>;
  const { ids, names } = await findLaborerIds(supabase, site_id, laborer_name);
  if (!ids.length) return JSON.stringify({ error: `No laborer found matching "${laborer_name}"` });
  const { data, error } = await supabase
    .from("advances")
    .select("amount, deduction_status, date")
    .in("laborer_id", ids)
    .eq("transaction_type", "advance")
    .eq("is_deleted", false);
  if (error) return JSON.stringify({ error: error.message });
  const pending = (data ?? [])
    .filter((r) => r.deduction_status === "pending" || r.deduction_status === "partial")
    .reduce((s, r) => s + (r.amount ?? 0), 0);
  const total = (data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
  return JSON.stringify({ laborer_name: names[0], total_advances: total, pending_balance: pending });
}

// ============================================================================
// Materials & Inventory executors
// ============================================================================

async function execGetMaterialStock(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, material_name } = args as Record<string, string | undefined>;
  const { data, error } = await supabase
    .from("stock_inventory")
    .select("current_qty, available_qty, avg_unit_cost, materials(name, unit)")
    .eq("site_id", site_id as string)
    .gt("current_qty", 0);
  if (error) return JSON.stringify({ error: error.message });
  let items = (data ?? []).map((r) => ({
    material: (r.materials as any)?.name ?? "Unknown",
    unit: (r.materials as any)?.unit ?? "",
    quantity: r.current_qty,
    available: r.available_qty,
    avg_cost: r.avg_unit_cost,
  }));
  if (material_name) {
    const lower = (material_name as string).toLowerCase();
    items = items.filter((i) => i.material.toLowerCase().includes(lower));
  }
  return JSON.stringify({ stock: items, total_items: items.length });
}

async function execGetPendingPurchaseOrders(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id } = args as Record<string, string>;
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("po_number, order_date, status, total_amount, vendors(name)")
    .eq("site_id", site_id)
    .in("status", ["pending_approval", "approved", "ordered", "partial_delivered"])
    .order("order_date", { ascending: false });
  if (error) return JSON.stringify({ error: error.message });
  const orders = (data ?? []).map((r) => ({
    po_number: r.po_number,
    vendor: (r.vendors as any)?.name ?? "Unknown",
    date: r.order_date,
    status: r.status,
    amount: r.total_amount,
  }));
  return JSON.stringify({ pending_pos: orders, count: orders.length });
}

async function execGetRecentDeliveries(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, date_from, date_to } = args as Record<string, string>;
  const { data, error } = await supabase
    .from("deliveries")
    .select("grn_number, delivery_date, verified, delivery_items(received_qty, materials(name, unit))")
    .eq("site_id", site_id)
    .gte("delivery_date", date_from)
    .lte("delivery_date", date_to)
    .order("delivery_date", { ascending: false });
  if (error) return JSON.stringify({ error: error.message });
  const deliveries = (data ?? []).map((d) => ({
    grn: d.grn_number,
    date: d.delivery_date,
    verified: d.verified,
    items: ((d.delivery_items as any[]) ?? []).map((i: any) => ({
      material: i.materials?.name ?? "Unknown",
      unit: i.materials?.unit ?? "",
      qty: i.received_qty,
    })),
  }));
  return JSON.stringify({ deliveries, count: deliveries.length });
}

async function execGetMaterialUsage(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, date_from, date_to, material_name } = args as Record<string, string | undefined>;
  const { data, error } = await supabase
    .from("stock_transactions")
    .select("quantity, transaction_date, stock_inventory(material_id, materials(name, unit))")
    .eq("site_id", site_id as string)
    .eq("transaction_type", "usage")
    .gte("transaction_date", date_from as string)
    .lte("transaction_date", date_to as string);
  if (error) return JSON.stringify({ error: error.message });
  let records = (data ?? []).map((r) => {
    const inv = r.stock_inventory as any;
    return {
      material: inv?.materials?.name ?? "Unknown",
      unit: inv?.materials?.unit ?? "",
      quantity: r.quantity,
      date: r.transaction_date,
    };
  });
  if (material_name) {
    const lower = (material_name as string).toLowerCase();
    records = records.filter((r) => r.material.toLowerCase().includes(lower));
  }
  const byMaterial: Record<string, { unit: string; total: number }> = {};
  for (const r of records) {
    const existing = byMaterial[r.material] ?? { unit: r.unit, total: 0 };
    existing.total += r.quantity ?? 0;
    byMaterial[r.material] = existing;
  }
  return JSON.stringify({ usage_by_material: byMaterial, date_from, date_to });
}

// ============================================================================
// Rentals & Equipment executors
// ============================================================================

async function execGetActiveRentals(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id } = args as Record<string, string>;
  const { data, error } = await supabase
    .from("rental_orders")
    .select("rental_order_number, start_date, estimated_total, vendors(name), rental_order_items(quantity, rental_items(name))")
    .eq("site_id", site_id)
    .eq("status", "active")
    .order("start_date", { ascending: false });
  if (error) return JSON.stringify({ error: error.message });
  const orders = (data ?? []).map((r) => ({
    order_number: r.rental_order_number,
    vendor: (r.vendors as any)?.name ?? "Unknown",
    start_date: r.start_date,
    estimated_total: r.estimated_total,
    items: ((r.rental_order_items as any[]) ?? []).map((i: any) => ({
      item: i.rental_items?.name ?? "Unknown",
      qty: i.quantity,
    })),
  }));
  return JSON.stringify({ active_rentals: orders, count: orders.length });
}

async function execGetRentalCost(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, date_from, date_to } = args as Record<string, string>;
  const { data, error } = await supabase
    .from("rental_orders")
    .select("actual_total, estimated_total, order_date")
    .eq("site_id", site_id)
    .gte("order_date", date_from)
    .lte("order_date", date_to)
    .neq("status", "cancelled");
  if (error) return JSON.stringify({ error: error.message });
  const total = (data ?? []).reduce((s, r) => s + (r.actual_total ?? r.estimated_total ?? 0), 0);
  return JSON.stringify({ rental_cost: total, date_from, date_to });
}

async function execGetEquipmentStatus(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id } = args as Record<string, string>;
  const { data, error } = await supabase
    .from("equipment")
    .select("equipment_code, name, status, condition, deployed_at, equipment_categories(name)")
    .eq("current_site_id", site_id)
    .eq("is_active", true);
  if (error) return JSON.stringify({ error: error.message });
  const items = (data ?? []).map((r) => ({
    code: r.equipment_code,
    name: r.name,
    category: (r.equipment_categories as any)?.name ?? "Unknown",
    status: r.status,
    condition: r.condition,
    deployed_at: r.deployed_at,
  }));
  return JSON.stringify({ equipment: items, count: items.length });
}

// ============================================================================
// Contracts & Settlements executors
// ============================================================================

async function execGetContractSummary(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id } = args as Record<string, string>;
  const { data, error } = await supabase
    .from("subcontracts")
    .select("total_value, status, laborers(name)")
    .eq("site_id", site_id);
  if (error) return JSON.stringify({ error: error.message });
  const contracts = (data ?? []).map((r) => ({
    laborer: (r.laborers as any)?.name ?? "Unknown",
    total_value: r.total_value,
    status: r.status,
  }));
  const total_value = contracts.reduce((s, r) => s + (r.total_value ?? 0), 0);
  return JSON.stringify({ contracts, total_value });
}

async function execGetClientPayments(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, date_from, date_to } = args as Record<string, string>;
  const { data, error } = await supabase
    .from("client_payments")
    .select("amount, payment_date, payment_mode, notes")
    .eq("site_id", site_id)
    .gte("payment_date", date_from)
    .lte("payment_date", date_to)
    .order("payment_date", { ascending: false });
  if (error) return JSON.stringify({ error: error.message });
  const total = (data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
  return JSON.stringify({ payments: data, total_received: total });
}

async function execGetSettlementStatus(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, date_from, date_to } = args as Record<string, string>;
  const { data, error } = await supabase
    .from("settlement_groups")
    .select("settlement_date, total_amount, is_cancelled, settlement_reference")
    .eq("site_id", site_id)
    .gte("settlement_date", date_from)
    .lte("settlement_date", date_to)
    .order("settlement_date", { ascending: false });
  if (error) return JSON.stringify({ error: error.message });
  const groups = (data ?? []).map((r) => ({
    settlement_date: r.settlement_date,
    amount: r.total_amount,
    status: r.is_cancelled ? "cancelled" : "paid",
    reference: r.settlement_reference,
  }));
  return JSON.stringify({ settlement_groups: groups });
}

async function execGetSettlementHistory(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, date_from, date_to } = args as Record<string, string>;
  const { data, error } = await supabase
    .from("settlement_groups")
    .select("total_amount, is_cancelled")
    .eq("site_id", site_id)
    .eq("is_cancelled", false)
    .gte("settlement_date", date_from)
    .lte("settlement_date", date_to);
  if (error) return JSON.stringify({ error: error.message });
  const total = (data ?? []).reduce((s, r) => s + (r.total_amount ?? 0), 0);
  return JSON.stringify({ total_settled: total, groups_settled: data?.length ?? 0 });
}

// ============================================================================
// Tea Shop executors
// ============================================================================

async function execGetTeaShopBalance(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id } = args as Record<string, string>;
  const { data: entries, error: e1 } = await supabase
    .from("tea_shop_entries")
    .select("amount")
    .eq("site_id", site_id);
  if (e1) return JSON.stringify({ error: e1.message });
  const { data: settlements, error: e2 } = await supabase
    .from("tea_shop_settlements")
    .select("amount_paid")
    .eq("site_id", site_id);
  if (e2) return JSON.stringify({ error: e2.message });
  const total_debit = (entries ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
  const total_credit = (settlements ?? []).reduce((s, r) => s + (r.amount_paid ?? 0), 0);
  const balance = total_debit - total_credit;
  return JSON.stringify({ balance, total_debit, total_credit });
}

async function execGetTeaShopEntries(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, date_from, date_to } = args as Record<string, string>;
  const { data, error } = await supabase
    .from("tea_shop_entries")
    .select("date, amount, notes")
    .eq("site_id", site_id)
    .gte("date", date_from)
    .lte("date", date_to)
    .order("date", { ascending: false });
  if (error) return JSON.stringify({ error: error.message });
  const total = (data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
  return JSON.stringify({ entries: data, total, count: data?.length ?? 0 });
}

// ============================================================================
// Laborers & Teams executors
// ============================================================================

async function execGetLaborerCount(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id } = args as Record<string, string>;
  const laborerIds = await getSiteLaborerIds(supabase, site_id);
  return JSON.stringify({ active_laborers: laborerIds.length });
}

async function execGetLaborersByCategory(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id } = args as Record<string, string>;
  const laborerIds = await getSiteLaborerIds(supabase, site_id);
  if (!laborerIds.length) return JSON.stringify({ by_category: {}, total: 0 });
  const { data, error } = await supabase
    .from("laborers")
    .select("category_id, labor_categories(name)")
    .in("id", laborerIds)
    .eq("status", "active");
  if (error) return JSON.stringify({ error: error.message });
  const byCategory: Record<string, number> = {};
  for (const r of data ?? []) {
    const cat = (r.labor_categories as any)?.name ?? r.category_id ?? "other";
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
  }
  return JSON.stringify({ by_category: byCategory, total: data?.length ?? 0 });
}

async function execGetTeamList(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id } = args as Record<string, string>;
  // Look up company_id from site
  const { data: site } = await supabase.from("sites").select("company_id").eq("id", site_id).single();
  const company_id = site?.company_id;
  if (!company_id) return JSON.stringify({ error: "Site not found" });
  const { data, error } = await supabase
    .from("teams")
    .select("name, leader_name")
    .eq("company_id", company_id)
    .eq("status", "active");
  if (error) return JSON.stringify({ error: error.message });
  const teams = (data ?? []).map((t) => ({
    name: t.name,
    leader: t.leader_name ?? "No leader",
  }));
  return JSON.stringify({ teams, count: teams.length });
}

async function execGetTeamMembers(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, team_name } = args as Record<string, string>;
  const { data: site } = await supabase.from("sites").select("company_id").eq("id", site_id).single();
  const company_id = site?.company_id;
  const { data: teamData, error: te } = await supabase
    .from("teams")
    .select("id, name")
    .eq("company_id", company_id ?? "")
    .ilike("name", `%${team_name}%`);
  if (te) return JSON.stringify({ error: te.message });
  if (!teamData?.length) return JSON.stringify({ error: `No team found matching "${team_name}"` });
  const teamId = teamData[0].id;
  const { data, error } = await supabase
    .from("laborers")
    .select("name, category_id, status, labor_categories(name)")
    .eq("team_id", teamId);
  if (error) return JSON.stringify({ error: error.message });
  const members = (data ?? []).map((r) => ({
    name: r.name,
    category: (r.labor_categories as any)?.name ?? r.category_id ?? "Unknown",
    status: r.status,
  }));
  return JSON.stringify({ team: teamData[0].name, members, count: members.length });
}

// ============================================================================
// Cross-site executors
// ============================================================================

async function execGetCrossSiteExpenses(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { company_id, date_from, date_to } = args as Record<string, string>;
  const { data: sites } = await supabase.from("sites").select("id, name").eq("company_id", company_id);
  const siteIds = sites?.map((s) => s.id) ?? [];
  if (!siteIds.length) return JSON.stringify({ error: "No sites found" });
  const { data, error } = await supabase
    .from("v_all_expenses")
    .select("amount, site_id")
    .in("site_id", siteIds)
    .gte("date", date_from)
    .lte("date", date_to);
  if (error) return JSON.stringify({ error: error.message });
  const bySite: Record<string, number> = {};
  for (const r of data ?? []) {
    if (r.site_id) {
      bySite[r.site_id] = (bySite[r.site_id] ?? 0) + (r.amount ?? 0);
    }
  }
  const result = (sites ?? [])
    .map((s) => ({ site: s.name, total: bySite[s.id] ?? 0 }))
    .sort((a, b) => b.total - a.total);
  return JSON.stringify({ by_site: result, date_from, date_to });
}

async function execGetCrossSiteAttendance(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { company_id, date_from, date_to } = args as Record<string, string>;
  const { data: sites } = await supabase.from("sites").select("id, name").eq("company_id", company_id);
  const siteIds = sites?.map((s) => s.id) ?? [];
  if (!siteIds.length) return JSON.stringify({ error: "No sites found" });
  const { data, error } = await supabase
    .from("daily_attendance")
    .select("site_id, laborer_id")
    .eq("is_deleted", false)
    .in("site_id", siteIds)
    .gte("date", date_from)
    .lte("date", date_to);
  if (error) return JSON.stringify({ error: error.message });
  const bySite: Record<string, Set<string>> = {};
  for (const r of data ?? []) {
    if (!bySite[r.site_id]) bySite[r.site_id] = new Set();
    bySite[r.site_id].add(r.laborer_id);
  }
  const result = (sites ?? [])
    .map((s) => ({ site: s.name, unique_workers: bySite[s.id]?.size ?? 0 }))
    .sort((a, b) => b.unique_workers - a.unique_workers);
  return JSON.stringify({ by_site: result, date_from, date_to });
}

// ============================================================================
// Misc executors
// ============================================================================

async function execGetHolidayList(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, date_from, date_to } = args as Record<string, string>;
  const { data, error } = await supabase
    .from("site_holidays")
    .select("date, reason, is_paid_holiday")
    .eq("site_id", site_id)
    .gte("date", date_from)
    .lte("date", date_to)
    .order("date");
  if (error) return JSON.stringify({ error: error.message });
  return JSON.stringify({ holidays: data, count: data?.length ?? 0 });
}
