"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import { wrapQueryFn } from "@/lib/utils/timeout";
import { useAuth } from "@/contexts/AuthContext";
import { deriveCountsFromLines } from "@/lib/taskWork/dayLogCost";
import type { TaskWorkDayLog, TaskWorkDayLogInput } from "@/types/taskWork.types";

const dl = (supabase: ReturnType<typeof createClient>) =>
  supabase.from("task_work_day_logs" as any) as any;

/** Day-log rows for a package, most recent first. */
export function useTaskWorkDayLogs(packageId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.taskWork.dayLogs(packageId ?? "none"),
    enabled: !!packageId,
    queryFn: wrapQueryFn(
      async () => {
        if (!packageId) return [];
        const { data, error } = await dl(supabase)
          .select("*")
          .eq("package_id", packageId)
          .order("log_date", { ascending: false });
        if (error) throw error;
        return (data ?? []) as TaskWorkDayLog[];
      },
      { operationName: "useTaskWorkDayLogs" }
    ),
    staleTime: 60 * 1000,
  });
}

function invalidate(
  queryClient: ReturnType<typeof useQueryClient>,
  packageId: string,
  siteId?: string
) {
  queryClient.invalidateQueries({
    queryKey: queryKeys.taskWork.dayLogs(packageId),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.taskWork.profitability(packageId),
  });
  if (siteId) {
    queryClient.invalidateQueries({
      queryKey: queryKeys.taskWork.profitabilityBySite(siteId),
    });
  }
}

/**
 * Insert or update a day's per-type breakdown. There's one row per
 * (package, date), so re-logging the same date overwrites it (upsert on the
 * unique constraint). worker_count and man_days are DERIVED from the lines
 * (Σ counts); man_days keeps decimals so half-days are preserved.
 */
export function useUpsertTaskWorkDayLog() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();

  return useMutation({
    mutationFn: async (input: TaskWorkDayLogInput) => {
      await ensureFreshSession();
      const supabase = createClient();
      const { worker_count, man_days } = deriveCountsFromLines(input.worker_lines);
      const { data, error } = await dl(supabase)
        .upsert(
          {
            package_id: input.package_id,
            site_id: input.site_id,
            log_date: input.log_date,
            worker_count,
            worker_note: input.worker_note ?? null,
            man_days,
            worker_lines: input.worker_lines,
            recorded_by: userProfile?.id ?? null,
          },
          { onConflict: "package_id,log_date" }
        )
        .select()
        .single();
      if (error) throw error;
      return data as TaskWorkDayLog;
    },
    onSuccess: (row) => invalidate(queryClient, row.package_id, row.site_id),
  });
}

export function useDeleteTaskWorkDayLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string; packageId: string; siteId: string }) => {
      await ensureFreshSession();
      const supabase = createClient();
      const { error } = await dl(supabase).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_v, variables) =>
      invalidate(queryClient, variables.packageId, variables.siteId),
  });
}
