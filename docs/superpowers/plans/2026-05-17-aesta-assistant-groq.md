# AESTA Assistant — Groq Tool-Calling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken keyword/Gemini intent-matching approach in the AESTA chat assistant with a Groq Llama-3.3-70B tool-calling loop so any natural-language question about site data returns a correct, readable answer.

**Architecture:** A Next.js API route (`/api/chat`) accepts the user's question plus conversation history, calls Groq with 34 Supabase query tools defined in OpenAI function-calling format, executes whichever tools Groq selects using the authenticated server-side Supabase client, feeds results back to Groq, and returns the final natural-language answer. The existing `useChatAssistant` hook is updated to call this route and maintain multi-turn history; the old Gemini/intent-parser path remains as an offline fallback.

**Tech Stack:** `groq-sdk` npm package, Groq Llama-3.3-70B-Versatile (free tier), Next.js API route, `@supabase/ssr` server client, existing `src/lib/supabase/server.ts`.

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/app/api/chat/route.ts` | POST handler: auth → Groq tool loop → response |
| Create | `src/lib/chat-assistant/chat-tools.ts` | 34 tool definitions + executor functions (server-side Supabase) |
| Modify | `src/lib/chat-assistant/types.ts` | Add `ChatApiRequest`, `ChatApiResponse`, `ConversationHistoryItem` |
| Modify | `src/hooks/useChatAssistant.ts` | Call `/api/chat`, maintain conversation history, keyword fallback |
| Modify | `.env.local` | Add `GROQ_API_KEY` |

---

## Task 1: Install groq-sdk and configure environment

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `.env.local`

- [ ] **Step 1.1: Install groq-sdk**

```bash
npm install groq-sdk
```

Expected output includes `added 1 package` (groq-sdk).

- [ ] **Step 1.2: Add GROQ_API_KEY to .env.local**

Get a free API key from https://console.groq.com → "Create API Key". Open `.env.local` and add this line (server-side only — no `NEXT_PUBLIC_` prefix):

```
GROQ_API_KEY=gsk_your_actual_key_here
```

- [ ] **Step 1.3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add groq-sdk dependency"
```

---

## Task 2: Add new TypeScript types

**Files:**
- Modify: `src/lib/chat-assistant/types.ts`

- [ ] **Step 2.1: Append new types to types.ts**

Open `src/lib/chat-assistant/types.ts` and add the following at the end of the file:

```typescript
// ============================================================================
// Chat API Types (Groq integration)
// ============================================================================

export interface ConversationHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export interface ChatApiRequest {
  question: string;
  siteId: string | null;        // null = All Sites (company-wide)
  companyId: string;
  siteName: string;
  dateFrom: string;             // YYYY-MM-DD
  dateTo: string;               // YYYY-MM-DD
  history: ConversationHistoryItem[];
}

export interface ChatApiResponse {
  answer: string;
  error?: string;
}
```

- [ ] **Step 2.2: Commit**

```bash
git add src/lib/chat-assistant/types.ts
git commit -m "feat(chat): add ChatApiRequest/Response types for Groq integration"
```

---

## Task 3: Create chat-tools.ts (34 tool definitions + executors)

**Files:**
- Create: `src/lib/chat-assistant/chat-tools.ts`

This file defines all 34 Groq tool schemas and the corresponding Supabase query executor functions. Every executor accepts the authenticated server Supabase client so RLS still applies.

- [ ] **Step 3.1: Create the file with the complete implementation**

Create `src/lib/chat-assistant/chat-tools.ts` with the following content:

```typescript
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
    .eq("site_id", site_id)
    .ilike("name", `%${laborer_name}%`);
  return {
    ids: data?.map((l) => l.id) ?? [],
    names: data?.map((l) => l.name) ?? [],
  };
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
    .select("date, day_type, daily_earnings, laborer_id, laborers(name, category)")
    .eq("is_deleted", false)
    .eq("site_id", site_id)
    .gte("date", date_from)
    .lte("date", date_to)
    .order("date", { ascending: true });
  if (error) return JSON.stringify({ error: error.message });
  const records = (data ?? []).map((r) => ({
    date: r.date,
    name: (r.laborers as any)?.name ?? "Unknown",
    category: (r.laborers as any)?.category ?? "",
    day_type: r.day_type,
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
    .select("date, day_type, daily_earnings")
    .eq("is_deleted", false)
    .eq("site_id", site_id)
    .in("laborer_id", ids)
    .gte("date", date_from)
    .lte("date", date_to);
  if (error) return JSON.stringify({ error: error.message });
  const total_days = (data ?? []).reduce((s, r) => s + (r.day_type === "full" ? 1 : 0.5), 0);
  const total_earnings = (data ?? []).reduce((s, r) => s + (r.daily_earnings ?? 0), 0);
  return JSON.stringify({ laborer_name: names[0], records: data, total_days, total_earnings });
}

// ============================================================================
// Salary executors
// ============================================================================

async function execGetTotalSalary(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, date_from, date_to } = args as Record<string, string>;
  // salary_periods links to laborers via laborer_id; filter by site through laborer
  const { data: laborers } = await supabase.from("laborers").select("id").eq("site_id", site_id);
  const ids = laborers?.map((l) => l.id) ?? [];
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
  const { data: laborers } = await supabase.from("laborers").select("id").eq("site_id", site_id);
  const ids = laborers?.map((l) => l.id) ?? [];
  if (!ids.length) return JSON.stringify({ salary_paid: 0 });
  const { data, error } = await supabase
    .from("salary_payments")
    .select("amount")
    .in("laborer_id", ids)
    .gte("payment_date", date_from)
    .lte("payment_date", date_to);
  if (error) return JSON.stringify({ error: error.message });
  const total = (data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
  return JSON.stringify({ salary_paid: total, date_from, date_to });
}

async function execGetSalaryPending(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, date_from, date_to } = args as Record<string, string>;
  const { data: laborers } = await supabase.from("laborers").select("id").eq("site_id", site_id);
  const ids = laborers?.map((l) => l.id) ?? [];
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
    .select("laborer_id, daily_earnings, laborers(name, category)")
    .eq("is_deleted", false)
    .eq("site_id", site_id as string)
    .gte("date", date_from as string)
    .lte("date", date_to as string);
  if (error) return JSON.stringify({ error: error.message });
  const byLaborer = new Map<string, { name: string; category: string; total: number }>();
  for (const r of data ?? []) {
    const name = (r.laborers as any)?.name ?? r.laborer_id;
    const cat = (r.laborers as any)?.category ?? "";
    const existing = byLaborer.get(r.laborer_id) ?? { name, category: cat, total: 0 };
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
    byDate[r.date] = (byDate[r.date] ?? 0) + (r.amount ?? 0);
  }
  const rows = Object.entries(byDate).map(([date, total]) => ({ date, total }));
  return JSON.stringify({ daily_costs: rows });
}

// ============================================================================
// Advance executors
// ============================================================================

async function execGetTotalAdvances(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, date_from, date_to } = args as Record<string, string>;
  const { data, error } = await supabase
    .from("advances")
    .select("amount")
    .eq("site_id", site_id)
    .gte("date", date_from)
    .lte("date", date_to);
  if (error) return JSON.stringify({ error: error.message });
  const total = (data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
  return JSON.stringify({ total_advances: total, count: data?.length ?? 0 });
}

async function execGetPendingAdvances(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id } = args as Record<string, string>;
  const { data, error } = await supabase
    .from("advances")
    .select("amount, date, laborers(name)")
    .eq("site_id", site_id)
    .eq("is_settled", false)
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
    .select("amount, is_settled, date")
    .eq("site_id", site_id)
    .in("laborer_id", ids);
  if (error) return JSON.stringify({ error: error.message });
  const pending = (data ?? []).filter((r) => !r.is_settled).reduce((s, r) => s + (r.amount ?? 0), 0);
  const total = (data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
  return JSON.stringify({ laborer_name: names[0], total_advances: total, pending_balance: pending });
}

// ============================================================================
// Materials & Inventory executors
// ============================================================================

async function execGetMaterialStock(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, material_name } = args as Record<string, string | undefined>;
  let query = supabase
    .from("stock_inventory")
    .select("current_qty, available_qty, avg_unit_cost, materials(name, unit)")
    .eq("site_id", site_id as string)
    .gt("current_qty", 0);
  const { data, error } = await query;
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
    .in("status", ["pending", "approved", "ordered", "partially_delivered"])
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
  let query = supabase
    .from("stock_transactions")
    .select("quantity, transaction_date, materials(name, unit)")
    .eq("site_id", site_id as string)
    .eq("transaction_type", "issue")
    .gte("transaction_date", date_from as string)
    .lte("transaction_date", date_to as string);
  const { data, error } = await query;
  if (error) return JSON.stringify({ error: error.message });
  let records = (data ?? []).map((r) => ({
    material: (r.materials as any)?.name ?? "Unknown",
    unit: (r.materials as any)?.unit ?? "",
    quantity: r.quantity,
    date: r.transaction_date,
  }));
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
    .select("contract_value, amount_paid, status, laborers(name)")
    .eq("site_id", site_id);
  if (error) return JSON.stringify({ error: error.message });
  const contracts = (data ?? []).map((r) => ({
    laborer: (r.laborers as any)?.name ?? "Unknown",
    contract_value: r.contract_value,
    amount_paid: r.amount_paid,
    status: r.status,
    balance: (r.contract_value ?? 0) - (r.amount_paid ?? 0),
  }));
  const total_value = contracts.reduce((s, r) => s + (r.contract_value ?? 0), 0);
  const total_paid = contracts.reduce((s, r) => s + (r.amount_paid ?? 0), 0);
  return JSON.stringify({ contracts, total_value, total_paid, balance_due: total_value - total_paid });
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
    .select("week_ending, total_amount, status, laborers(name)")
    .eq("site_id", site_id)
    .gte("week_ending", date_from)
    .lte("week_ending", date_to)
    .order("week_ending", { ascending: false });
  if (error) return JSON.stringify({ error: error.message });
  const groups = (data ?? []).map((r) => ({
    mesthri: (r.laborers as any)?.name ?? "Unknown",
    week_ending: r.week_ending,
    amount: r.total_amount,
    status: r.status,
  }));
  return JSON.stringify({ settlement_groups: groups });
}

async function execGetSettlementHistory(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, date_from, date_to } = args as Record<string, string>;
  const { data, error } = await supabase
    .from("settlement_groups")
    .select("total_amount, status")
    .eq("site_id", site_id)
    .eq("status", "paid")
    .gte("week_ending", date_from)
    .lte("week_ending", date_to);
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
    .select("amount")
    .eq("site_id", site_id);
  if (e2) return JSON.stringify({ error: e2.message });
  const total_debit = (entries ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
  const total_credit = (settlements ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
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
  const { count, error } = await supabase
    .from("laborers")
    .select("id", { count: "exact", head: true })
    .eq("site_id", site_id)
    .eq("is_active", true);
  if (error) return JSON.stringify({ error: error.message });
  return JSON.stringify({ active_laborers: count ?? 0 });
}

async function execGetLaborersByCategory(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id } = args as Record<string, string>;
  const { data, error } = await supabase
    .from("laborers")
    .select("category")
    .eq("site_id", site_id)
    .eq("is_active", true);
  if (error) return JSON.stringify({ error: error.message });
  const byCategory: Record<string, number> = {};
  for (const r of data ?? []) {
    const cat = r.category ?? "other";
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
  }
  return JSON.stringify({ by_category: byCategory, total: data?.length ?? 0 });
}

async function execGetTeamList(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id } = args as Record<string, string>;
  const { data, error } = await supabase
    .from("teams")
    .select("name, laborers(name)")
    .eq("site_id", site_id);
  if (error) return JSON.stringify({ error: error.message });
  const teams = (data ?? []).map((t) => ({
    name: t.name,
    leader: (t.laborers as any)?.name ?? "No leader",
  }));
  return JSON.stringify({ teams, count: teams.length });
}

async function execGetTeamMembers(args: Record<string, unknown>, supabase: DbClient): Promise<string> {
  const { site_id, team_name } = args as Record<string, string>;
  const { data: teamData, error: te } = await supabase
    .from("teams")
    .select("id, name")
    .eq("site_id", site_id)
    .ilike("name", `%${team_name}%`);
  if (te) return JSON.stringify({ error: te.message });
  if (!teamData?.length) return JSON.stringify({ error: `No team found matching "${team_name}"` });
  const teamId = teamData[0].id;
  const { data, error } = await supabase
    .from("laborers")
    .select("name, category, is_active")
    .eq("team_id", teamId);
  if (error) return JSON.stringify({ error: error.message });
  return JSON.stringify({ team: teamData[0].name, members: data, count: data?.length ?? 0 });
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
    bySite[r.site_id] = (bySite[r.site_id] ?? 0) + (r.amount ?? 0);
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
    .select("date, name, description")
    .eq("site_id", site_id)
    .gte("date", date_from)
    .lte("date", date_to)
    .order("date");
  if (error) return JSON.stringify({ error: error.message });
  return JSON.stringify({ holidays: data, count: data?.length ?? 0 });
}
```

- [ ] **Step 3.2: Commit**

```bash
git add src/lib/chat-assistant/chat-tools.ts
git commit -m "feat(chat): add 34 Groq tool definitions and Supabase executor functions"
```

---

## Task 4: Create the /api/chat route (Groq tool-calling loop)

**Files:**
- Create: `src/app/api/chat/route.ts`

- [ ] **Step 4.1: Create the API route**

Create `src/app/api/chat/route.ts` with the following content:

```typescript
import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { createClient } from "@/lib/supabase/server";
import { TOOL_DEFINITIONS, executeTool } from "@/lib/chat-assistant/chat-tools";
import type { ChatApiRequest, ChatApiResponse } from "@/lib/chat-assistant/types";
import dayjs from "dayjs";

const SYSTEM_PROMPT = (ctx: {
  siteName: string;
  siteId: string | null;
  companyId: string;
  dateFrom: string;
  dateTo: string;
  today: string;
}) => `You are AESTA Assistant, an AI helper for Aesta Construction Manager.
You help site engineers and construction managers get quick insights from their site data.

Current context:
- Site: ${ctx.siteName}${ctx.siteId ? ` (ID: ${ctx.siteId})` : " (all sites)"}
- Company ID: ${ctx.companyId}
- Date range selected: ${ctx.dateFrom} to ${ctx.dateTo}
- Today: ${ctx.today}

Instructions:
1. Always use tools to fetch data before answering quantitative questions about numbers, people, or costs.
2. Format all monetary amounts with ₹ symbol in Indian number format (e.g., ₹1,25,000).
3. Lead with the key number or fact, then add details if relevant.
4. You may call multiple tools if the question spans multiple domains.
5. If the user asks about a date not in the selected range, derive the correct date range from their question and use it as tool arguments.
6. Respond in Tamil if the user writes in Tamil; otherwise respond in English.
7. If no relevant data is found after calling tools, say so clearly — do not guess or fabricate numbers.
8. Keep answers concise — construction managers are busy.
9. When the user asks a cross-site question and no site is selected, use company_id: ${ctx.companyId} in the cross-site tools.`;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Parse and validate request
    const body: ChatApiRequest = await request.json();
    const { question, siteId, companyId, siteName, dateFrom, dateTo, history } = body;

    if (!question?.trim()) {
      return NextResponse.json<ChatApiResponse>({ answer: "", error: "No question provided" }, { status: 400 });
    }

    // 2. Verify authentication
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json<ChatApiResponse>({ answer: "", error: "Not authenticated" }, { status: 401 });
    }

    // 3. Verify GROQ_API_KEY is configured
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json<ChatApiResponse>(
        { answer: "", error: "GROQ_API_KEY is not configured. Add it to .env.local." },
        { status: 500 }
      );
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const today = dayjs().format("YYYY-MM-DD");

    // 4. Build initial messages
    const systemMessage = {
      role: "system" as const,
      content: SYSTEM_PROMPT({ siteName, siteId, companyId, dateFrom, dateTo, today }),
    };

    const historyMessages = (history ?? []).map((h) => ({
      role: h.role as "user" | "assistant",
      content: h.content,
    }));

    let messages: Groq.Chat.ChatCompletionMessageParam[] = [
      systemMessage,
      ...historyMessages,
      { role: "user", content: question },
    ];

    // 5. Groq tool-calling loop (max 5 iterations to prevent infinite loops)
    for (let iteration = 0; iteration < 5; iteration++) {
      const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages,
        tools: TOOL_DEFINITIONS,
        tool_choice: "auto",
        temperature: 0.2,
        max_tokens: 1024,
      });

      const choice = response.choices[0];

      if (!choice) {
        return NextResponse.json<ChatApiResponse>({ answer: "No response from AI. Please try again." });
      }

      // If Groq finished (no more tool calls), return the answer
      if (choice.finish_reason === "stop" || !choice.message.tool_calls?.length) {
        return NextResponse.json<ChatApiResponse>({
          answer: choice.message.content ?? "No answer generated.",
        });
      }

      // Execute all tool calls in parallel
      const toolCallResults = await Promise.all(
        choice.message.tool_calls.map(async (tc) => {
          const args = JSON.parse(tc.function.arguments ?? "{}") as Record<string, unknown>;
          const result = await executeTool(tc.function.name, args, supabase);
          return {
            role: "tool" as const,
            tool_call_id: tc.id,
            content: result,
          };
        })
      );

      // Append assistant message (with tool calls) + tool results to conversation
      messages = [...messages, choice.message, ...toolCallResults];
    }

    // Fallback if loop exhausted
    return NextResponse.json<ChatApiResponse>({
      answer: "I ran too many queries trying to answer that. Please try a more specific question.",
    });
  } catch (err) {
    console.error("[/api/chat] error:", err);
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    return NextResponse.json<ChatApiResponse>({ answer: "", error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4.2: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat(chat): add /api/chat route with Groq Llama-3.3 tool-calling loop"
```

---

## Task 5: Update useChatAssistant.ts to call the API route

**Files:**
- Modify: `src/hooks/useChatAssistant.ts`

The hook needs to:
1. Maintain a `conversationHistory` array for multi-turn context
2. Call `POST /api/chat` instead of the old Gemini/intent-parser flow
3. Fall back to the old keyword parser if the API call fails
4. Clear history on `clearChat()`

- [ ] **Step 5.1: Replace the hook with the updated version**

Replace the full contents of `src/hooks/useChatAssistant.ts` with:

```typescript
"use client";

import { useState, useCallback, useEffect } from "react";
import dayjs from "dayjs";
import { parseIntentSmart } from "@/lib/chat-assistant/intent-parser";
import { executeQuery } from "@/lib/chat-assistant/query-builder";
import {
  formatResponse,
  formatUnknownIntentResponse,
  formatLowConfidenceResponse,
  formatErrorResponse,
  createUserMessage,
  createWelcomeMessage,
} from "@/lib/chat-assistant/response-formatter";
import { CONFIDENCE_THRESHOLDS } from "@/lib/chat-assistant/constants";
import type {
  ChatMessage,
  ChatFilters,
  ConversationHistoryItem,
} from "@/lib/chat-assistant/types";
import { useSitesData } from "@/contexts/SiteContext";

interface UseChatAssistantOptions {
  initialSiteId?: string;
}

export function useChatAssistant(options: UseChatAssistantOptions = {}) {
  const { initialSiteId } = options;
  const { sites } = useSitesData();

  const [messages, setMessages] = useState<ChatMessage[]>([createWelcomeMessage()]);
  const [filters, setFilters] = useState<ChatFilters>({
    siteId: initialSiteId || "all",
    dateFrom: null,
    dateTo: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  // Multi-turn conversation history sent to the API each request
  const [conversationHistory, setConversationHistory] = useState<ConversationHistoryItem[]>([]);

  useEffect(() => {
    if (initialSiteId) {
      setFilters((prev) => ({ ...prev, siteId: initialSiteId }));
    }
  }, [initialSiteId]);

  const getSiteName = useCallback(
    (siteId: string | "all"): string => {
      if (siteId === "all") return "All Sites";
      return sites.find((s) => s.id === siteId)?.name ?? "Unknown Site";
    },
    [sites]
  );

  const getCompanyId = useCallback((): string => {
    return (sites[0] as any)?.company_id ?? "";
  }, [sites]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      const userMessage = createUserMessage(trimmed);
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      try {
        // --- Primary path: Groq API route ---
        const dateFrom = filters.dateFrom
          ? dayjs(filters.dateFrom).format("YYYY-MM-DD")
          : dayjs().format("YYYY-MM-DD");
        const dateTo = filters.dateTo
          ? dayjs(filters.dateTo).format("YYYY-MM-DD")
          : dayjs().format("YYYY-MM-DD");

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: trimmed,
            siteId: filters.siteId === "all" ? null : filters.siteId,
            companyId: getCompanyId(),
            siteName: getSiteName(filters.siteId),
            dateFrom,
            dateTo,
            history: conversationHistory,
          }),
          signal: AbortSignal.timeout(30_000),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const { answer, error: apiError } = await response.json();

        if (apiError) {
          throw new Error(apiError);
        }

        // Build assistant message
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          type: "assistant",
          text: answer,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);

        // Update conversation history for follow-up questions
        setConversationHistory((prev) => [
          ...prev,
          { role: "user", content: trimmed },
          { role: "assistant", content: answer },
        ]);
      } catch (apiErr) {
        // --- Fallback path: keyword-based intent parser (when API is unavailable) ---
        console.warn("Groq API unavailable, falling back to keyword parser:", apiErr);
        try {
          const parsedIntent = await parseIntentSmart(trimmed, filters);

          if (parsedIntent.confidence < CONFIDENCE_THRESHOLDS.UNKNOWN) {
            setMessages((prev) => [...prev, formatUnknownIntentResponse()]);
            return;
          }

          if (parsedIntent.confidence < CONFIDENCE_THRESHOLDS.HIGH) {
            setMessages((prev) => [
              ...prev,
              formatLowConfidenceResponse(parsedIntent, [parsedIntent.intent]),
            ]);
            return;
          }

          const result = await executeQuery(parsedIntent.intent, parsedIntent.filters);
          const siteName = getSiteName(filters.siteId);
          const responseMsg = formatResponse(result, parsedIntent, siteName);
          setMessages((prev) => [...prev, responseMsg]);
        } catch (fallbackErr) {
          console.error("Chat assistant fallback error:", fallbackErr);
          setMessages((prev) => [...prev, formatErrorResponse(fallbackErr as Error)]);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [filters, isLoading, getSiteName, getCompanyId, conversationHistory]
  );

  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      if (suggestion.toLowerCase().includes("show suggestions")) {
        setMessages((prev) => [...prev, formatUnknownIntentResponse()]);
        return;
      }
      sendMessage(suggestion);
    },
    [sendMessage]
  );

  const clearChat = useCallback(() => {
    setMessages([createWelcomeMessage()]);
    setConversationHistory([]);
  }, []);

  return {
    messages,
    filters,
    setFilters,
    isLoading,
    sendMessage,
    handleSuggestionClick,
    clearChat,
  };
}
```

- [ ] **Step 5.2: Commit**

```bash
git add src/hooks/useChatAssistant.ts
git commit -m "feat(chat): update hook to call /api/chat route with Groq, keep keyword fallback"
```

---

## Task 6: Verify end-to-end

**Files:** None — verification only

- [ ] **Step 6.1: Start the dev server**

```bash
npm run dev
```

Expected: Server starts on http://localhost:3000 with no TypeScript errors.

- [ ] **Step 6.2: Confirm GROQ_API_KEY is loaded**

Open a new terminal and run:

```bash
node -e "require('dotenv').config({path:'.env.local'}); console.log('GROQ_API_KEY present:', !!process.env.GROQ_API_KEY)"
```

Expected output: `GROQ_API_KEY present: true`

- [ ] **Step 6.3: Test the API route directly**

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question":"hello","siteId":null,"companyId":"test","siteName":"Test","dateFrom":"2026-05-01","dateTo":"2026-05-17","history":[]}'
```

Expected: JSON response with `{"answer":"..."}`. If you get `401 Not authenticated` that is expected — the route requires a logged-in session; use the browser instead.

- [ ] **Step 6.4: Open the app and test the assistant**

Navigate to http://localhost:3000/dev-login (auto-logs in with test credentials). Then open the AI Assistant panel (click the robot icon in the sidebar).

Test each of these prompts and confirm you get a real answer (not "I didn't understand that"):

| Prompt | Expected result |
|--------|-----------------|
| How many workers came today? | A number (e.g., "5 workers") |
| Total salary this week | A ₹ amount |
| Pending advances | A list of names and amounts |
| Which site spent the most this month? | A comparison table of sites |
| How much cement is in stock? | Quantity from stock_inventory |
| Active rentals | List of rental orders |

- [ ] **Step 6.5: Test multi-turn follow-up**

Send: "Total expenses this month"
Then send: "What was the biggest category?"

Expected: The second answer references the same month without needing the date repeated (because history is passed to Groq).

- [ ] **Step 6.6: Test Tamil**

Send: "இந்த வாரம் மொத்த சம்பளம் என்ன?"

Expected: Groq responds in Tamil with the salary figure.

- [ ] **Step 6.7: Check browser console for errors**

Open DevTools → Console. There should be no errors. If you see any 4xx/5xx errors from `/api/chat`, check:
- `GROQ_API_KEY` is correct in `.env.local`
- The Groq key has credits (free tier quota)
- The Supabase table names in chat-tools.ts match your actual schema (query `supabase.from("...")` calls)

- [ ] **Step 6.8: Final commit**

```bash
git add -A
git commit -m "feat(chat): AESTA Assistant now powered by Groq Llama-3.3-70B with 34 tool definitions"
```

---

## Notes for the Engineer

### If a query executor returns an error about a missing column

The executors in `chat-tools.ts` use column names based on the database types file. If a column doesn't exist (e.g., `salary_payments.laborer_id` might actually be called something else), the Supabase query will return an error string that gets fed back to Groq — Groq will tell the user "no data found" rather than crashing. To fix: inspect the actual table with Supabase MCP (`execute_sql: SELECT column_name FROM information_schema.columns WHERE table_name='salary_payments'`) and update the relevant executor function.

### If `client_payments` table doesn't exist

The `get_client_payments` executor queries a `client_payments` table. If this table doesn't exist in your schema, comment out the case in the `executeTool` switch and the corresponding definition in `TOOL_DEFINITIONS`. Groq will not call tools that aren't defined.

### Groq free tier limits

Llama-3.3-70B-Versatile: 30 requests/min, 14,400 requests/day on free tier. For typical usage in a small construction company, this is more than enough. If you hit rate limits, Groq returns a 429 error — the fallback keyword parser will activate automatically.

### Adding more tools later

To add a new tool:
1. Add its definition object to `TOOL_DEFINITIONS` in `chat-tools.ts`
2. Add its executor function in the same file
3. Add a `case "tool_name":` line in the `executeTool` switch

No changes to the API route or hook are needed.