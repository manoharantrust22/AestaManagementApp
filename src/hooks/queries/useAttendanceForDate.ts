/**
 * useAttendanceForDate
 *
 * Powers the daily-shape branch of the InspectPane Attendance tab.
 * Calls the get_attendance_for_date RPC (added in migration
 * 20260426120000_add_inspect_pane_rpcs.sql) which returns the 3 totals
 * (daily / market / tea) plus per-laborer + per-market-laborer detail
 * rows for one site + one date in a single round-trip.
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface AttendanceForDateData {
  dailyTotal: number;
  marketTotal: number;
  teaShopTotal: number;
  dailyLaborers: Array<{
    id: string;
    name: string;
    role: string;
    fullDay: boolean;
    amount: number;
  }>;
  marketLaborers: Array<{
    id: string;
    role: string;
    count: number;
    amount: number;
  }>;
}

function toNumber(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function useAttendanceForDate(siteId: string, date: string) {
  const supabase = createClient();
  return useQuery<AttendanceForDateData>({
    queryKey: ["inspect-attendance-date", siteId, date],
    enabled: Boolean(siteId && date),
    staleTime: 30_000,
    queryFn: async (): Promise<AttendanceForDateData> => {
      // RPC returns a single jsonb row; supabase-js wraps that in `data`.
      const { data, error } = await (supabase as any).rpc(
        "get_attendance_for_date",
        { p_site_id: siteId, p_date: date }
      );
      if (error) throw error;
      const r: any = data || {};
      return {
        dailyTotal: toNumber(r.daily_total),
        marketTotal: toNumber(r.market_total),
        teaShopTotal: toNumber(r.tea_shop_total),
        dailyLaborers: (r.daily_laborers ?? []).map((l: any) => ({
          id: String(l.id),
          name: String(l.name ?? "").trim(),
          role: String(l.role ?? ""),
          fullDay: Boolean(l.full_day),
          amount: toNumber(l.amount),
        })),
        marketLaborers: (r.market_laborers ?? []).map((m: any) => ({
          id: String(m.id),
          role: String(m.role ?? ""),
          count: toNumber(m.count),
          amount: toNumber(m.amount),
        })),
      };
    },
  });
}
