import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";

export interface WeekDayAggregate {
  date: string;
  laborersWorked: number;
  totalEarnings: number;
}

export interface WeekHoliday {
  date: string;
  reason: string | null;
  isPaid: boolean;
}

export interface WeekAggregate {
  days: WeekDayAggregate[];
  holidays: WeekHoliday[];
  totalLaborers: number;
  totalEarnings: number;
}

export function useWeekAggregateAttendance(
  siteId: string | undefined,
  subcontractId: string | null,
  weekStart: string | undefined,
  weekEnd: string | undefined
) {
  const supabase = createClient();
  return useQuery<WeekAggregate>({
    queryKey: [
      "week-aggregate-attendance",
      siteId,
      subcontractId,
      weekStart,
      weekEnd,
    ],
    enabled: Boolean(siteId && weekStart && weekEnd),
    staleTime: 15_000,
    queryFn: async () => {
      let attendanceQ = supabase
        .from("daily_attendance")
        .select("date, laborer_id, daily_earnings, laborers!inner(laborer_type)")
        .eq("site_id", siteId!)
        .eq("is_deleted", false)
        .eq("laborers.laborer_type", "contract")
        .gte("date", weekStart!)
        .lte("date", weekEnd!);
      if (subcontractId) attendanceQ = attendanceQ.eq("subcontract_id", subcontractId);

      const holidaysQ = supabase
        .from("site_holidays")
        .select("date, reason, is_paid_holiday")
        .eq("site_id", siteId!)
        .gte("date", weekStart!)
        .lte("date", weekEnd!);

      const [attendanceRes, holidaysRes] = await withTimeout(
        Promise.all([attendanceQ, holidaysQ]),
        TIMEOUTS.QUERY,
        "Week aggregate attendance query timed out. Please retry.",
      );
      if (attendanceRes.error) throw attendanceRes.error;
      if (holidaysRes.error) throw holidaysRes.error;

      const byDate = new Map<
        string,
        { laborers: Set<string>; earnings: number }
      >();
      const allLaborers = new Set<string>();
      let total = 0;
      for (const r of (attendanceRes.data ?? []) as Array<{
        date: string;
        laborer_id: string;
        daily_earnings: number | string | null;
      }>) {
        const e = byDate.get(r.date) ?? { laborers: new Set(), earnings: 0 };
        e.laborers.add(r.laborer_id);
        const amt = Number(r.daily_earnings || 0);
        e.earnings += amt;
        byDate.set(r.date, e);
        allLaborers.add(r.laborer_id);
        total += amt;
      }
      const days: WeekDayAggregate[] = Array.from(byDate.entries())
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([date, v]) => ({
          date,
          laborersWorked: v.laborers.size,
          totalEarnings: v.earnings,
        }));
      const holidays: WeekHoliday[] = ((holidaysRes.data ?? []) as Array<{
        date: string;
        reason: string | null;
        is_paid_holiday: boolean | null;
      }>).map((h) => ({
        date: h.date,
        reason: h.reason,
        isPaid: Boolean(h.is_paid_holiday),
      }));
      return {
        days,
        holidays,
        totalLaborers: allLaborers.size,
        totalEarnings: total,
      };
    },
  });
}
