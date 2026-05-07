import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
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
    staleTime: 30 * 1000,
    queryFn: async (): Promise<WorkUpdates | null> => {
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
    },
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
    },
  });
}
