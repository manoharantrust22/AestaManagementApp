import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";

interface HandToCrewInput {
  subcontractId: string;
  siteId: string;
  contractType: "mesthri" | "specialist";
  teamId: string | null;
  laborerId: string | null;
  /** Default = Σ scope point values, editable after bargaining. */
  agreedValue: number;
  /** yyyy-mm-dd or null. */
  startDate: string | null;
}

/**
 * Hand a Future plan (draft subcontract) to a crew as a normal Active contract.
 *
 * One atomic UPDATE sets the crew + the bargained value + status='active', which
 * satisfies contract_party_check in a single statement (the DB rejects a
 * crew-less activation). The `.eq("status","draft")` guard prevents a double
 * handover racing two open dialogs. On a check violation (23514 — no crew) the
 * error is rewritten to a friendly message.
 */
export function useHandContractToCrew() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: HandToCrewInput): Promise<void> => {
      await ensureFreshSession();
      const supabase = createClient();
      const { error } = await (supabase as any)
        .from("subcontracts")
        .update({
          contract_type: input.contractType,
          team_id: input.contractType === "mesthri" ? input.teamId : null,
          laborer_id: input.contractType === "specialist" ? input.laborerId : null,
          total_value: input.agreedValue,
          is_rate_based: false,
          status: "active",
          start_date: input.startDate || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.subcontractId)
        .eq("status", "draft");
      if (error) {
        if (error.code === "23514") {
          throw new Error("Pick a crew before activating this plan.");
        }
        throw error;
      }
    },
    onSuccess: (_v, input) => {
      const { siteId } = input;
      queryClient.invalidateQueries({ queryKey: ["trades", "site", siteId] });
      queryClient.invalidateQueries({ queryKey: ["trade-reconciliations", "site", siteId] });
      queryClient.invalidateQueries({ queryKey: ["trade-activity", "site", siteId] });
      queryClient.invalidateQueries({ queryKey: ["subcontracts", "site", siteId] });
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("subcontracts-changed");
        bc.postMessage({ siteId, at: Date.now() });
        bc.close();
      }
    },
  });
}
