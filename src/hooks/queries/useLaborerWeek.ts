/**
 * useLaborerWeek
 *
 * Powers the weekly-shape branch of the InspectPane Attendance tab.
 * Calls the get_laborer_week_breakdown RPC (added in migration
 * 20260426120000_add_inspect_pane_rpcs.sql) which returns the 3 totals
 * (daily salary / contract / total), the 7-day per-status breakdown,
 * and the days-not-worked list (in-week holidays without attendance)
 * for one site + one laborer + one week.
 *
 * NOTE: the RPC currently emits contract_amount = 0 because piece-rate
 * amounts aren't tracked at a per-laborer-per-week granularity in
 * production today. See the migration header for context.
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";

export interface LaborerWeekDay {
  date: string; // YYYY-MM-DD
  dayName: string; // "Mon", "Tue", ...
  status: "full" | "half" | "off" | "holiday";
  amount: number;
}

export interface LaborerWeekData {
  dailySalary: number;
  contractAmount: number;
  total: number;
  role: string;
  laborerName: string;
  days: LaborerWeekDay[];
  daysNotWorked: Array<{ date: string; reason: string }>;
}

function toNumber(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toStatus(s: unknown): LaborerWeekDay["status"] {
  if (s === "full" || s === "half" || s === "off" || s === "holiday") return s;
  return "off";
}

export function useLaborerWeek(
  siteId: string,
  laborerId: string,
  weekStart: string,
  weekEnd: string
) {
  const supabase = createClient();
  return useQuery<LaborerWeekData>({
    queryKey: ["inspect-laborer-week", siteId, laborerId, weekStart, weekEnd],
    enabled: Boolean(siteId && laborerId && weekStart && weekEnd),
    staleTime: 30_000,
    queryFn: async (): Promise<LaborerWeekData> => {
      const { data, error } = await withTimeout(
        Promise.resolve((supabase as any).rpc(
          "get_laborer_week_breakdown",
          {
            p_site_id: siteId,
            p_laborer_id: laborerId,
            p_week_start: weekStart,
            p_week_end: weekEnd,
          }
        )),
        TIMEOUTS.QUERY,
        "Laborer week breakdown query timed out. Please retry.",
      );
      if (error) throw error;
      const r: any = data || {};
      return {
        dailySalary: toNumber(r.daily_salary),
        contractAmount: toNumber(r.contract_amount),
        total: toNumber(r.total),
        role: String(r.role ?? ""),
        laborerName: String(r.laborer_name ?? "").trim(),
        days: (r.days ?? []).map((d: any) => ({
          date: String(d.date),
          dayName: String(d.day_name ?? ""),
          status: toStatus(d.status),
          amount: toNumber(d.amount),
        })),
        daysNotWorked: (r.days_not_worked ?? []).map((d: any) => ({
          date: String(d.date),
          reason: String(d.reason ?? ""),
        })),
      };
    },
  });
}
