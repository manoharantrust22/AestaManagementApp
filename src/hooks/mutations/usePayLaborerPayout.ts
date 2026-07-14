"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import {
  payLaborerWeeklyPayout,
  reverseLaborerPayout,
} from "@/lib/services/payoutService";
import type {
  PayLaborerPayoutConfig,
  PayLaborerPayoutResult,
} from "@/types/payout.types";

/**
 * A payout fans out into settlement rows on several sites and touches every
 * money reader: the payout console itself, each site's salary waterfall +
 * slice summary, the contract ledgers/payment feeds, the settlements list,
 * the payments ledger, and /site/expenses.
 */
function invalidatePayoutReaders(qc: ReturnType<typeof useQueryClient>) {
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

export function usePayLaborerPayout() {
  const qc = useQueryClient();
  const supabase = createClient();
  return useMutation<PayLaborerPayoutResult, Error, PayLaborerPayoutConfig>({
    mutationFn: (config) => payLaborerWeeklyPayout(supabase, config),
    onSuccess: () => invalidatePayoutReaders(qc),
  });
}

export function useReverseLaborerPayout() {
  const qc = useQueryClient();
  const supabase = createClient();
  return useMutation<
    { batch_id: string; already_reversed: boolean; reversed_groups: number },
    Error,
    { batchId: string; reason?: string }
  >({
    mutationFn: ({ batchId, reason }) => reverseLaborerPayout(supabase, batchId, reason),
    onSuccess: () => invalidatePayoutReaders(qc),
  });
}
