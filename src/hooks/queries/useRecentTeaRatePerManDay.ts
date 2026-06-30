/**
 * useRecentTeaRatePerManDay
 *
 * Blended ₹-per-man-day from a group's recent FILLED tea entries
 * (Σ total_amount / Σ total_day_units over the last N group entries). Used to
 * PRE-FILL a suggested amount when the engineer backfills a contract day that
 * currently shows ₹0 — a suggestion only; the engineer always edits before save.
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
      if (!data || data.length === 0) return null;
      let amount = 0;
      let units = 0;
      for (const r of data as { total_amount: number; total_day_units: number }[]) {
        amount += Number(r.total_amount) || 0;
        units += Number(r.total_day_units) || 0;
      }
      return units > 0 ? amount / units : null;
    },
  });
}
