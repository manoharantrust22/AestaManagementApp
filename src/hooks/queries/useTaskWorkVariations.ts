"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import { wrapQueryFn } from "@/lib/utils/timeout";
import { useAuth } from "@/contexts/AuthContext";
import type {
  TaskWorkVariation,
  TaskWorkVariationInput,
  TaskWorkVariationStatus,
} from "@/types/taskWork.types";

// `task_work_variations` is new (not in generated DB types yet) so the client
// is cast to `any`, matching useTaskWorkDayLogs / useSubcontractEstimateLines.
const tv = (supabase: ReturnType<typeof createClient>) =>
  supabase.from("task_work_variations" as any) as any;

/** Variations (extras) for a package, most recent request first. */
export function useTaskWorkVariations(packageId: string | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: queryKeys.taskWork.variations(packageId ?? "none"),
    enabled: !!packageId,
    staleTime: 60 * 1000,
    queryFn: wrapQueryFn(
      async () => {
        if (!packageId) return [];
        const { data, error } = await tv(supabase)
          .select("*")
          .eq("package_id", packageId)
          .order("requested_date", { ascending: false })
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data ?? []) as TaskWorkVariation[];
      },
      { operationName: "useTaskWorkVariations" }
    ),
  });
}

function invalidate(
  queryClient: ReturnType<typeof useQueryClient>,
  packageId: string,
  siteId?: string
) {
  queryClient.invalidateQueries({
    queryKey: queryKeys.taskWork.variations(packageId),
  });
  // The effective agreed price changes → profitability/exposure views refresh.
  queryClient.invalidateQueries({
    queryKey: queryKeys.taskWork.profitability(packageId),
  });
  if (siteId) {
    queryClient.invalidateQueries({
      queryKey: queryKeys.taskWork.profitabilityBySite(siteId),
    });
  }
}

/** Record a new extra-money request (starts as pending). */
export function useCreateTaskWorkVariation() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  return useMutation({
    mutationFn: async (input: TaskWorkVariationInput) => {
      await ensureFreshSession();
      const supabase = createClient();
      const { data, error } = await tv(supabase)
        .insert({
          package_id: input.package_id,
          site_id: input.site_id,
          amount: input.amount,
          reason: input.reason.trim(),
          requested_date: input.requested_date,
          status: "pending",
          created_by: userProfile?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as TaskWorkVariation;
    },
    onSuccess: (row) => invalidate(queryClient, row.package_id, row.site_id),
  });
}

/** Approve or reject a pending request, stamping the decision date + note. */
export function useDecideTaskWorkVariation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      id: string;
      packageId: string;
      siteId: string;
      status: Extract<TaskWorkVariationStatus, "approved" | "rejected">;
      decided_date: string;
      decided_note?: string | null;
    }) => {
      await ensureFreshSession();
      const supabase = createClient();
      const { error } = await tv(supabase)
        .update({
          status: vars.status,
          decided_date: vars.decided_date,
          decided_note: vars.decided_note ?? null,
        })
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: (_v, vars) => invalidate(queryClient, vars.packageId, vars.siteId),
  });
}

export function useDeleteTaskWorkVariation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
    }: {
      id: string;
      packageId: string;
      siteId: string;
    }) => {
      await ensureFreshSession();
      const supabase = createClient();
      const { error } = await tv(supabase).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_v, vars) => invalidate(queryClient, vars.packageId, vars.siteId),
  });
}
