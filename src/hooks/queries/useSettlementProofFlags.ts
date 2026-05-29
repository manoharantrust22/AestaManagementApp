/**
 * useSettlementProofFlags
 *
 * Batched proof/notes presence lookup for a set of settlement_references.
 * Powers the at-a-glance per-ref indicator icons in the InspectPane's
 * roll-up settlement views. One IN-query, returns a Map keyed by reference.
 */
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";

export interface SettlementProofFlag {
  hasProof: boolean;
  hasNotes: boolean;
}

export function useSettlementProofFlags(refs: string[], siteId: string) {
  const supabase = createClient();
  const sortedKey = [...refs].sort().join(",");
  return useQuery<Map<string, SettlementProofFlag>>({
    queryKey: ["settlement-proof-flags", siteId, sortedKey],
    enabled: refs.length > 0,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const { data, error } = await withTimeout(
        Promise.resolve(
          (supabase.from("settlement_groups") as any)
            .select("settlement_reference, proof_url, proof_urls, notes")
            .in("settlement_reference", refs)
            .abortSignal(signal)
        ),
        TIMEOUTS.QUERY,
        "Proof-flags query timed out. Please retry."
      );
      if (error) throw error;
      const map = new Map<string, SettlementProofFlag>();
      for (const row of (data ?? []) as any[]) {
        const hasProof =
          (Array.isArray(row.proof_urls) && row.proof_urls.length > 0) ||
          Boolean(row.proof_url);
        const hasNotes =
          typeof row.notes === "string" && row.notes.trim().length > 0;
        map.set(row.settlement_reference, { hasProof, hasNotes });
      }
      return map;
    },
  });
}
