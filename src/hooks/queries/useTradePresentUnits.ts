import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

/** Returns { [siteId]: { [tradeCategoryId]: presentDayUnits } } for a given date. */
export function useTradePresentUnits(siteIds: string[], date: string | null | undefined) {
  const supabase: any = createClient();
  const ids = [...new Set(siteIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: ["trade-present-units", ids, date],
    enabled: ids.length > 0 && !!date,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, Record<string, number>>> => {
      const out: Record<string, Record<string, number>> = {};
      const add = (siteId: string, cat: string | null, units: number) => {
        if (!cat) return;
        out[siteId] ??= {};
        out[siteId][cat] = (out[siteId][cat] ?? 0) + units;
      };
      // named labourers: daily_attendance.day_units, laborer -> category_id
      const { data: named, error: e1 } = await supabase
        .from("daily_attendance")
        .select("site_id, day_units, is_deleted, laborers(category_id)")
        .in("site_id", ids)
        .eq("date", date);
      if (e1) throw e1;
      for (const r of named ?? []) {
        if (r.is_deleted) continue;
        add(r.site_id, r.laborers?.category_id ?? null, Number(r.day_units ?? 1));
      }
      // market labourers: market_laborer_attendance.count, role -> category_id
      const { data: market, error: e2 } = await supabase
        .from("market_laborer_attendance")
        .select("site_id, count, labor_roles(category_id)")
        .in("site_id", ids)
        .eq("date", date);
      if (e2) throw e2;
      for (const r of market ?? []) {
        add(r.site_id, r.labor_roles?.category_id ?? null, Number(r.count ?? 0));
      }
      return out;
    },
  });
}
