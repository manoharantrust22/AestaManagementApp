"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import { wrapQueryFn } from "@/lib/utils/timeout";
import type { TaskWorkProfitability } from "@/types/taskWork.types";

const prof = (supabase: ReturnType<typeof createClient>) =>
  supabase.from("v_task_work_profitability" as any) as any;

/** Live profitability for one package (drawer). */
export function useTaskWorkProfitability(packageId: string | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: queryKeys.taskWork.profitability(packageId ?? "none"),
    enabled: !!packageId,
    queryFn: wrapQueryFn(
      async () => {
        if (!packageId) return null;
        const { data, error } = await prof(supabase)
          .select("*")
          .eq("package_id", packageId)
          .maybeSingle();
        if (error) throw error;
        return (data ?? null) as TaskWorkProfitability | null;
      },
      { operationName: "useTaskWorkProfitability" }
    ),
    staleTime: 60 * 1000,
  });
}

/** Profitability for every package on a site (list KPIs). */
export function useSiteTaskWorkProfitability(siteId: string | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: queryKeys.taskWork.profitabilityBySite(siteId ?? "none"),
    enabled: !!siteId,
    queryFn: wrapQueryFn(
      async () => {
        if (!siteId) return [];
        const { data, error } = await prof(supabase)
          .select("*")
          .eq("site_id", siteId);
        if (error) throw error;
        return (data ?? []) as TaskWorkProfitability[];
      },
      { operationName: "useSiteTaskWorkProfitability" }
    ),
    staleTime: 60 * 1000,
  });
}

export type RateBookRow = TaskWorkProfitability;

/**
 * Company-wide rate book: every rate-measured package the caller can see
 * (RLS-scoped via the view). The work-type name (category_name) is joined
 * inside the view, so grouping is a plain client-side reduce.
 */
export function useTaskWorkRateBook() {
  const supabase = createClient();
  return useQuery({
    queryKey: queryKeys.taskWork.rateBook(),
    queryFn: wrapQueryFn(
      async () => {
        const { data, error } = await prof(supabase)
          .select("*")
          .not("computed_rate_per_unit", "is", null);
        if (error) throw error;
        return (data ?? []) as RateBookRow[];
      },
      { operationName: "useTaskWorkRateBook" }
    ),
    staleTime: 5 * 60 * 1000,
  });
}
