/**
 * useSettlementFullDetails
 *
 * Powers the InspectPane's single-settlement view. Fetches the FULL settlement
 * record (proofs, notes, payer split, isContract, isCancelled) for one
 * settlement_reference by reusing getSettlementDetailsByReference — the same
 * canonical read used by SettlementRefDetailDialog. Replaces the older
 * lightweight useSettlementDetails projection.
 */
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";
import {
  getSettlementDetailsByReference,
  type SettlementDetails,
} from "@/components/payments/SettlementRefDetailDialog";

export function useSettlementFullDetails(
  settlementRef: string | null,
  siteId: string
) {
  const supabase = createClient();
  return useQuery<SettlementDetails | null>({
    queryKey: ["inspect-settlement-full", settlementRef, siteId],
    enabled: Boolean(settlementRef),
    staleTime: 60_000,
    queryFn: async () => {
      if (!settlementRef) return null;
      return withTimeout(
        getSettlementDetailsByReference(supabase, settlementRef),
        TIMEOUTS.QUERY,
        "Settlement details query timed out. Please retry."
      );
    },
  });
}
