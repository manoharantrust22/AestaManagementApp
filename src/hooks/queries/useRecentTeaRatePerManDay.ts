/**
 * useRecentTeaRatePerManDay
 *
 * Blended ₹-per-man-day from a group's recent FILLED tea entries
 * (Σ total_amount / Σ total_day_units over the last N group entries). Used to
 * PRE-FILL a suggested amount when the engineer backfills a contract day that
 * currently shows ₹0 — a suggestion only; the engineer always edits before save.
 *
 * Legacy group entries left `total_day_units` null, so when the primary lookup
 * finds nothing we fall back to the same rate derived from per-site allocations
 * (Σ allocated_amount / Σ day_units_sum) — robust for older groups.
 *
 * Returns null when there's no history to learn from.
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { cacheTTL } from "@/lib/cache/keys";

export function useRecentTeaRatePerManDay(siteGroupId: string | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["tea-rate-per-manday", siteGroupId],
    enabled: !!siteGroupId,
    staleTime: cacheTTL.transactional,
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await (supabase.from("tea_shop_entries") as any)
        .select("total_amount, total_day_units")
        .eq("site_group_id", siteGroupId)
        .eq("is_group_entry", true)
        .gt("total_day_units", 0)
        .gt("total_amount", 0)
        .order("date", { ascending: false })
        .limit(30);
      if (error) {
        console.warn("Recent tea rate lookup failed:", error.message);
        return null;
      }
      if (data && data.length > 0) {
        let amount = 0;
        let units = 0;
        for (const r of data as { total_amount: number; total_day_units: number }[]) {
          amount += Number(r.total_amount) || 0;
          units += Number(r.total_day_units) || 0;
        }
        if (units > 0) return amount / units;
      }

      // Fallback: derive the rate from recent group entries' allocations, which
      // carry day_units_sum even when the entry's total_day_units is null.
      const { data: recent } = await (supabase.from("tea_shop_entries") as any)
        .select("id")
        .eq("site_group_id", siteGroupId)
        .eq("is_group_entry", true)
        .order("date", { ascending: false })
        .limit(60);
      const recentIds = ((recent || []) as { id: string }[]).map((r) => r.id);
      if (recentIds.length === 0) return null;
      const { data: allocs } = await (supabase.from("tea_shop_entry_allocations") as any)
        .select("allocated_amount, day_units_sum")
        .in("entry_id", recentIds);
      let amt = 0;
      let units = 0;
      for (const a of (allocs || []) as { allocated_amount: number; day_units_sum: number }[]) {
        amt += Number(a.allocated_amount) || 0;
        units += Number(a.day_units_sum) || 0;
      }
      return units > 0 ? amt / units : null;
    },
  });
}
