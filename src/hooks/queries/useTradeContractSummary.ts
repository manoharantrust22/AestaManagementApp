import { useMemo } from "react";
import { useSiteTrades } from "@/hooks/queries/useTrades";
import { useSiteTradeReconciliations } from "@/hooks/queries/useTradeReconciliations";
import {
  assembleSummaries,
  type AssembledSummaries,
} from "@/lib/workforce/tradeContractSummary";

/**
 * Compose the existing trades + reconciliation queries into money summaries
 * (per trade and per contract) for the attendance money strip and chip dot.
 * Pure assembly lives in tradeContractSummary.ts; this is glue + memoisation.
 */
export function useTradeContractSummaries(
  siteId: string | undefined
): AssembledSummaries & { isLoading: boolean } {
  const tradesQuery = useSiteTrades(siteId);
  const reconQuery = useSiteTradeReconciliations(siteId);

  const assembled = useMemo(
    () => assembleSummaries(tradesQuery.data, reconQuery.data),
    [tradesQuery.data, reconQuery.data]
  );

  return { ...assembled, isLoading: tradesQuery.isLoading || reconQuery.isLoading };
}
