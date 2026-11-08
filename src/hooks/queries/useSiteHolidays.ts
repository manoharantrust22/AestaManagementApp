import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import { holidayInScope, type SiteHoliday } from "@/lib/utils/holidayUtils";

/**
 * Site holidays in a date window, filtered to one workspace scope
 * (that trade's holidays + "all workspaces" rows; see holidayInScope).
 *
 * Used by the trade attendance view, which (unlike the Civil page) has no
 * holiday state of its own. Default window: 5 weeks back → 120 days ahead,
 * covering the trade table's 4 visible weeks plus the upcoming-holidays strip.
 */
export function useSiteHolidays(
  siteId: string | undefined,
  tradeCategoryId: string | null,
  opts: { from?: string; to?: string } = {}
) {
  const supabase = createClient();
  const from = opts.from ?? dayjs().subtract(5, "week").format("YYYY-MM-DD");
  const to = opts.to ?? dayjs().add(120, "day").format("YYYY-MM-DD");
  return useQuery<SiteHoliday[], Error, SiteHoliday[]>({
    queryKey: ["site-holidays", siteId, from, to],
    enabled: !!siteId,
    staleTime: 60 * 1000,
    queryFn: wrapQueryFn(async (): Promise<SiteHoliday[]> => {
      const { data, error } = await supabase
        .from("site_holidays")
        .select("*")
        .eq("site_id", siteId!)
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SiteHoliday[];
    }),
    select: (rows: SiteHoliday[]) => rows.filter((h) => holidayInScope(h, tradeCategoryId)),
  });
}
