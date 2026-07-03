"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import { wrapQueryFn } from "@/lib/utils/timeout";
import { useAuth } from "@/contexts/AuthContext";
import type {
  TaskWorkPackage,
  TaskWorkPackageWithMeta,
  TaskWorkPackageInput,
  TaskWorkStatus,
} from "@/types/taskWork.types";

// The task_work_* tables are not in the generated db.types.ts yet, so every
// query casts through `as any` (same pattern as useTechnicians).
const tw = (supabase: ReturnType<typeof createClient>) =>
  supabase.from("task_work_packages" as any) as any;

/**
 * Generate a TW-YYMMDD-NNN reference for a site via the DB function, then
 * insert. The advisory lock inside the function releases before this separate
 * insert lands, so a concurrent create can still collide on the per-site unique
 * constraint (23505) — we regenerate and retry a few times.
 */
async function insertWithReference(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  siteId: string
): Promise<TaskWorkPackage> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: refData, error: refError } = await (supabase as any).rpc(
      "generate_task_work_reference",
      { p_site_id: siteId }
    );
    if (refError) throw refError;

    const { data, error } = await tw(supabase)
      .insert({ ...payload, package_number: refData })
      .select()
      .single();

    if (!error) return data as TaskWorkPackage;
    // 23505 = unique_violation on (site_id, package_number); regenerate + retry.
    if ((error as { code?: string }).code === "23505" && attempt < 4) continue;
    throw error;
  }
  throw new Error("Could not allocate a unique task-work reference.");
}

/**
 * List task-work packages for a site (optionally filtered by status), newest
 * first, with the work-type category name and parent subcontract title joined.
 */
export function useTaskWorkPackages(
  siteId: string | undefined,
  statusFilter?: TaskWorkStatus | "all"
) {
  const supabase = createClient();

  return useQuery({
    queryKey: [...queryKeys.taskWork.bySite(siteId ?? "none"), statusFilter ?? "all"],
    enabled: !!siteId,
    queryFn: wrapQueryFn(
      async () => {
        if (!siteId) return [];
        let query = tw(supabase)
          .select(
            `*, labor_categories(name), subcontracts(title)`
          )
          .eq("site_id", siteId)
          .order("created_at", { ascending: false });

        if (statusFilter && statusFilter !== "all") {
          query = query.eq("status", statusFilter);
        }

        const { data, error } = await query;
        if (error) throw error;

        return (data ?? []).map((row: any) => ({
          ...row,
          category_name: row.labor_categories?.name ?? null,
          parent_subcontract_title: row.subcontracts?.title ?? null,
        })) as TaskWorkPackageWithMeta[];
      },
      { operationName: "useTaskWorkPackages" }
    ),
    staleTime: 60 * 1000,
  });
}

/** Single package by id. */
export function useTaskWorkPackage(id: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.taskWork.byId(id ?? "none"),
    enabled: !!id,
    queryFn: wrapQueryFn(
      async () => {
        if (!id) return null;
        const { data, error } = await tw(supabase)
          .select(`*, labor_categories(name), subcontracts(title)`)
          .eq("id", id)
          .single();
        if (error) throw error;
        return {
          ...data,
          category_name: (data as any).labor_categories?.name ?? null,
          parent_subcontract_title: (data as any).subcontracts?.title ?? null,
        } as TaskWorkPackageWithMeta;
      },
      { operationName: "useTaskWorkPackage" }
    ),
  });
}

function invalidatePackage(
  queryClient: ReturnType<typeof useQueryClient>,
  siteId: string,
  id?: string
) {
  queryClient.invalidateQueries({ queryKey: queryKeys.taskWork.bySite(siteId) });
  queryClient.invalidateQueries({
    queryKey: queryKeys.taskWork.profitabilityBySite(siteId),
  });
  if (id) {
    queryClient.invalidateQueries({ queryKey: queryKeys.taskWork.byId(id) });
  }
}

export function useCreateTaskWorkPackage() {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();

  return useMutation({
    mutationFn: async (input: TaskWorkPackageInput) => {
      await ensureFreshSession();
      const supabase = createClient();
      const payload = {
        ...input,
        created_by: userProfile?.id ?? null,
      };
      return insertWithReference(supabase, payload, input.site_id);
    },
    onSuccess: (row) => invalidatePackage(queryClient, row.site_id, row.id),
  });
}

export function useUpdateTaskWorkPackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      siteId,
      data,
    }: {
      id: string;
      siteId: string;
      data: Partial<TaskWorkPackageInput>;
    }) => {
      await ensureFreshSession();
      const supabase = createClient();
      const { data: row, error } = await tw(supabase)
        .update(data)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return row as TaskWorkPackage;
    },
    onSuccess: (_row, variables) =>
      invalidatePackage(queryClient, variables.siteId, variables.id),
  });
}

export function useDeleteTaskWorkPackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string; siteId: string }) => {
      await ensureFreshSession();
      const supabase = createClient();
      // Hard delete — day logs and payments cascade via FK ON DELETE CASCADE.
      const { error } = await tw(supabase).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_v, variables) =>
      invalidatePackage(queryClient, variables.siteId, variables.id),
  });
}

/**
 * Convert a CLEAN fixed-price subcontract TASK into a task-work PACKAGE so it
 * adopts the standardized Day-Log + Extras + Payments screen (like Barun's).
 *
 * Server-side (convert_subcontract_task_to_package RPC) inserts the package
 * nested under the task's current parent and deletes the original task, all in
 * one transaction. The RPC refuses if the task has children, attached packages,
 * or any recorded day-entries / payments — `error.message` carries the reason.
 *
 * Returns the new package id, and refreshes BOTH the trade ladder (the task
 * disappears) and the task-work caches (the package appears).
 */
export function useConvertTaskToPackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      subcontractId,
      maistryLaborerId,
      maistryName,
      status,
      totalValue,
    }: {
      subcontractId: string;
      siteId: string;
      /** Handover: the maistry who takes the package (else keep the task's laborer). */
      maistryLaborerId?: string | null;
      maistryName?: string | null;
      /** Handover: set 'active' to activate on conversion (else keep the task's status). */
      status?: "draft" | "active" | "on_hold" | "completed" | "cancelled";
      /** Handover: the bargained total (else keep the task's total_value). */
      totalValue?: number | null;
    }): Promise<string> => {
      await ensureFreshSession();
      const supabase = createClient();
      const { data, error } = await (supabase as any).rpc(
        "convert_subcontract_task_to_package",
        {
          p_subcontract_id: subcontractId,
          p_maistry_laborer_id: maistryLaborerId ?? null,
          p_maistry_name: maistryName ?? null,
          p_status: status ?? null,
          p_total_value: totalValue ?? null,
        }
      );
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_pkgId, variables) => {
      const { siteId } = variables;
      // Package side: new package + profitability.
      invalidatePackage(queryClient, siteId);
      // Trade ladder side: the converted task is gone — refresh the same keys
      // the create/move flows use so the tree reflects it immediately.
      queryClient.invalidateQueries({ queryKey: ["trades", "site", siteId] });
      queryClient.invalidateQueries({
        queryKey: ["trade-reconciliations", "site", siteId],
      });
      queryClient.invalidateQueries({
        queryKey: ["trade-activity", "site", siteId],
      });
      queryClient.invalidateQueries({
        queryKey: ["subcontracts", "site", siteId],
      });
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("subcontracts-changed");
        bc.postMessage({ siteId, at: Date.now() });
        bc.close();
      }
    },
  });
}
