import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";
import type { AuditPeriod } from "./useSiteAuditState";

export interface WaterfallFilledBy {
  ref: string;
  /** Slice allocated to this specific week. */
  amount: number;
  /** Full settlement_groups.total_amount. When > amount, the overflow filled
   *  earlier underpaid weeks (carry-forward). Older RPC versions don't
   *  return this — falls back to `amount`. */
  grossAmount: number;
  settledAt: string;
}

export interface WaterfallWeek {
  weekStart: string;
  weekEnd: string;
  daysWorked: number;
  laborerCount: number;
  wagesDue: number;
  paid: number;
  status: "settled" | "underpaid" | "pending";
  filledBy: WaterfallFilledBy[];
  /** 'legacy' or 'current' — only meaningful for sites in audit mode. Defaults
   *  to 'current' for non-auditing sites. */
  period: "legacy" | "current";
}

export interface UseSalaryWaterfallArgs {
  siteId: string | undefined;
  subcontractId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  /** Period scope ('all' | 'legacy' | 'current'). Defaults to 'all'.
   *  Non-auditing sites ignore this server-side. */
  period?: AuditPeriod;
}

export function useSalaryWaterfall(args: UseSalaryWaterfallArgs) {
  const supabase = createClient();
  const { siteId, subcontractId, dateFrom, dateTo, period = "all" } = args;
  return useQuery<WaterfallWeek[]>({
    queryKey: ["salary-waterfall", siteId, subcontractId, dateFrom, dateTo, period],
    enabled: Boolean(siteId),
    staleTime: 15_000,
    queryFn: async () => {
      // Wrap RPC in a Promise so withTimeout's Promise.race can short-circuit
      // a silently-hung request (browser pause/resume, transient network glitch,
      // or queueing behind the 6-conn limit). Without this, the queryFn never
      // resolves/rejects and the page stays in skeleton state until the user
      // refreshes — matches the reported "stuck loading, no errors" symptom.
      const { data, error } = await withTimeout(
        Promise.resolve((supabase as any).rpc("get_salary_waterfall", {
          p_site_id:        siteId,
          p_subcontract_id: subcontractId,
          p_date_from:      dateFrom,
          p_date_to:        dateTo,
          p_period:         period,
        })),
        TIMEOUTS.QUERY,
        "Salary waterfall query timed out. Please retry.",
      );
      if (error) throw error;
      const rows = (data ?? []) as Array<any>;
      return rows.map<WaterfallWeek>((r) => ({
        weekStart:    r.week_start,
        weekEnd:      r.week_end,
        daysWorked:   Number(r.days_worked) || 0,
        laborerCount: Number(r.laborer_count) || 0,
        wagesDue:     Number(r.wages_due) || 0,
        paid:         Number(r.paid) || 0,
        status:       r.status as WaterfallWeek["status"],
        period:       (r.period === "legacy" ? "legacy" : "current") as WaterfallWeek["period"],
        filledBy:     Array.isArray(r.filled_by)
          ? r.filled_by.map((f: any) => {
              const amount = Number(f.amount) || 0;
              return {
                ref:         String(f.ref),
                amount,
                grossAmount: f.gross_amount != null ? Number(f.gross_amount) : amount,
                settledAt:   String(f.settled_at),
              };
            })
          : [],
      }));
    },
  });
}
