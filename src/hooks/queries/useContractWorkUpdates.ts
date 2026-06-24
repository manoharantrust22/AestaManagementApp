import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import type { WorkUpdates } from "@/types/work-updates.types";

/**
 * Read + upsert per-contract daily work updates (Slice B).
 *
 * One row per (subcontract_id, date) in subcontract_work_updates. The
 * `work_updates` JSONB mirrors the existing daily_work_summary.work_updates
 * shape so MorningUpdateForm / EveningUpdateForm can be reused as-is.
 */
export function useContractWorkUpdates(
  contractId: string | undefined,
  date: string | undefined
) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["contract-work-updates", contractId, date],
    enabled: !!contractId && !!date,
    staleTime: 60 * 1000,
    queryFn: wrapQueryFn(async (): Promise<WorkUpdates | null> => {
      if (!contractId || !date) return null;
      const sb = supabase as any;
      const { data, error } = await sb
        .from("subcontract_work_updates")
        .select("work_updates")
        .eq("subcontract_id", contractId)
        .eq("date", date)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return (data.work_updates ?? null) as WorkUpdates | null;
    }, { operationName: "useContractWorkUpdates" }),
  });
}

export interface DatedWorkUpdate {
  date: string;
  workUpdates: WorkUpdates;
}

/**
 * The most recent days that have a saved work update for this contract
 * (newest first), for the contract-detail "work photos" timeline.
 */
export function useRecentContractWorkUpdates(
  contractId: string | undefined,
  limit = 6
) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["contract-work-updates-recent", contractId],
    enabled: !!contractId,
    staleTime: 60 * 1000,
    queryFn: wrapQueryFn(async (): Promise<DatedWorkUpdate[]> => {
      if (!contractId) return [];
      const sb = supabase as any;
      const { data, error } = await sb
        .from("subcontract_work_updates")
        .select("date, work_updates")
        .eq("subcontract_id", contractId)
        .order("date", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return ((data ?? []) as Array<{ date: string; work_updates: WorkUpdates | null }>)
        .filter((r) => r.work_updates)
        .map((r) => ({ date: r.date, workUpdates: r.work_updates as WorkUpdates }));
    }, { operationName: "useRecentContractWorkUpdates" }),
  });
}

interface SaveContractWorkUpdatesInput {
  contractId: string;
  date: string;
  workUpdates: WorkUpdates;
  userId?: string;
}

/**
 * Upsert mutation — one row per (contract, date). On success invalidates
 * the query for this date so the form sees its own write immediately.
 */
export function useSaveContractWorkUpdates() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveContractWorkUpdatesInput) => {
      const sb = supabase as any;
      const { error } = await sb
        .from("subcontract_work_updates")
        .upsert(
          {
            subcontract_id: input.contractId,
            date: input.date,
            work_updates: input.workUpdates,
            created_by: input.userId ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "subcontract_id,date" }
        );
      if (error) throw error;
    },
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({
        queryKey: ["contract-work-updates", input.contractId, input.date],
      });
      queryClient.invalidateQueries({
        queryKey: ["contract-work-updates-recent", input.contractId],
      });
    },
  });
}
