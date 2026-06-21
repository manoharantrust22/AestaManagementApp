import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

/**
 * Sets the supervisor-tracked "work done %" on a task work (subcontracts row). This drives
 * the Workforce exposure meter (paid vs value of work done). Column is additive + nullable
 * (mig 20260621120000); null clears tracking back to the neutral state.
 *
 * Invalidates the trade tree + reconciliations and broadcasts on the shared
 * `subcontracts-changed` channel so /site/subcontracts and other tabs refresh too.
 */
export function useUpdateSubcontractProgress(siteId: string | undefined) {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      contractId,
      percent,
    }: {
      contractId: string;
      percent: number | null;
    }) => {
      const value =
        percent == null ? null : Math.max(0, Math.min(100, Math.round(percent)));
      const { error } = await (supabase as any)
        .from("subcontracts")
        .update({ work_progress_percent: value })
        .eq("id", contractId);
      if (error) throw error;
      return value;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trades", "site", siteId] });
      qc.invalidateQueries({ queryKey: ["trade-reconciliations", "site", siteId] });
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("subcontracts-changed");
        bc.postMessage({ siteId, at: Date.now() });
        bc.close();
      }
    },
  });
}
