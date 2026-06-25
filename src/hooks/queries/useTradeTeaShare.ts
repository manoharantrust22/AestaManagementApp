import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface TeaShareRow {
  date: string;
  amount: number;
}

export function sumSharesByDate(rows: TeaShareRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.date, (m.get(r.date) ?? 0) + Number(r.amount || 0));
  return m;
}

export function useTradeTeaShare(params: {
  siteId: string | undefined;
  tradeCategoryId: string | null | undefined;
  startDate: string | null;
  endDate: string | null;
}) {
  const { siteId, tradeCategoryId, startDate, endDate } = params;
  const supabase: any = createClient();
  return useQuery({
    queryKey: ["trade-tea-share", siteId, tradeCategoryId, startDate, endDate],
    enabled: !!siteId && !!tradeCategoryId,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, number>> => {
      let query = supabase
        .from("v_trade_tea_share")
        .select("date, amount")
        .eq("site_id", siteId)
        .eq("trade_category_id", tradeCategoryId);
      if (startDate) query = query.gte("date", startDate);
      if (endDate) query = query.lte("date", endDate);
      const { data, error } = await query;
      if (error) throw error;
      return sumSharesByDate((data ?? []) as TeaShareRow[]);
    },
  });
}
