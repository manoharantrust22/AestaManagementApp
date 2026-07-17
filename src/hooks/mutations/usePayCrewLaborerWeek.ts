"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import {
  payCrewLaborerWeek,
  type SettlementResult,
} from "@/lib/services/settlementService";

type PayCrewLaborerWeekConfig = Parameters<typeof payCrewLaborerWeek>[1];

/**
 * A crew week payment writes settlement_groups + labor_payments + pwa, fills
 * the salary waterfall, and surfaces in expenses/ledgers — invalidate every
 * reader (mirrors usePayLaborerPayout).
 */
function invalidateCrewReaders(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["salary-crew-ledger"] });
  qc.invalidateQueries({ queryKey: ["weekly-payout-console"] });
  qc.invalidateQueries({ queryKey: ["salary-waterfall"] });
  qc.invalidateQueries({ queryKey: ["salary-slice-summary"] });
  qc.invalidateQueries({ queryKey: ["contract-labor-ledger"] });
  qc.invalidateQueries({ queryKey: ["contract-payment-history"] });
  qc.invalidateQueries({ queryKey: ["mesthri-commission-payable"] });
  qc.invalidateQueries({ queryKey: ["settlements"] });
  qc.invalidateQueries({ queryKey: ["payments-ledger"] });
  qc.invalidateQueries({ queryKey: queryKeys.expenses.all });
  qc.invalidateQueries({ queryKey: queryKeys.laborers.all });
}

export function usePayCrewLaborerWeek() {
  const qc = useQueryClient();
  const supabase = createClient();
  return useMutation<SettlementResult, Error, PayCrewLaborerWeekConfig>({
    mutationFn: async (config) => {
      const result = await payCrewLaborerWeek(supabase, config);
      if (!result.success) throw new Error(result.error || "Failed to pay the laborer.");
      return result;
    },
    // Preserve form state on network errors: no retry (project convention).
    retry: false,
    onSuccess: () => invalidateCrewReaders(qc),
  });
}

export { invalidateCrewReaders };
