"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import { wrapQueryFn } from "@/lib/utils/timeout";
import { useAuth } from "@/contexts/AuthContext";
import {
  createTaskWorkPayment,
  softDeleteTaskWorkPayment,
  type CreateTaskWorkPaymentConfig,
} from "@/lib/services/taskWorkService";
import type { TaskWorkPayment } from "@/types/taskWork.types";

const pay = (supabase: ReturnType<typeof createClient>) =>
  supabase.from("task_work_payments" as any) as any;

/** Non-deleted payments for a package, most recent first. */
export function useTaskWorkPayments(packageId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.taskWork.payments(packageId ?? "none"),
    enabled: !!packageId,
    queryFn: wrapQueryFn(
      async () => {
        if (!packageId) return [];
        const { data, error } = await pay(supabase)
          .select("*")
          .eq("package_id", packageId)
          .eq("is_deleted", false)
          .order("payment_date", { ascending: false });
        if (error) throw error;
        return (data ?? []) as TaskWorkPayment[];
      },
      { operationName: "useTaskWorkPayments" }
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
    queryKey: queryKeys.taskWork.payments(packageId),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.taskWork.profitability(packageId),
  });
  queryClient.invalidateQueries({ queryKey: queryKeys.taskWork.byId(packageId) });
  if (siteId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.taskWork.bySite(siteId) });
    queryClient.invalidateQueries({
      queryKey: queryKeys.taskWork.profitabilityBySite(siteId),
    });
  }
}

export function useCreateTaskWorkPayment() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();

  return useMutation({
    mutationFn: async (
      config: Omit<CreateTaskWorkPaymentConfig, "userId" | "userName">
    ) => {
      await ensureFreshSession();
      const supabase = createClient();
      const result = await createTaskWorkPayment(supabase, {
        ...config,
        userId: userProfile?.id ?? "",
        userName: userProfile?.name || userProfile?.email || "Unknown",
      });
      if (!result.success) {
        throw new Error(result.error || "Failed to record the payment.");
      }
      return result;
    },
    onSuccess: (_r, config) => invalidate(queryClient, config.packageId, config.siteId),
  });
}

export function useDeleteTaskWorkPayment() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();

  return useMutation({
    mutationFn: async ({
      paymentId,
      reason,
    }: {
      paymentId: string;
      packageId: string;
      siteId: string;
      reason: string;
    }) => {
      await ensureFreshSession();
      const supabase = createClient();
      const result = await softDeleteTaskWorkPayment(
        supabase,
        paymentId,
        reason,
        userProfile?.name || userProfile?.email || "Unknown",
        userProfile?.id ?? ""
      );
      if (!result.success) {
        throw new Error(result.error || "Failed to delete payment.");
      }
    },
    onSuccess: (_r, variables) =>
      invalidate(queryClient, variables.packageId, variables.siteId),
  });
}
