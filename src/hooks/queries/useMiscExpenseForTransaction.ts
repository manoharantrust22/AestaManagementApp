"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import {
  mapMiscExpenseRow,
  type MiscExpenseVerification,
} from "@/components/wallet-v2/spendDetailHelpers";

/**
 * Fetch the misc_expenses row linked to a wallet spend transaction, for the
 * Spend details verification dialog. Linked by engineer_transaction_id (the
 * robust link — not by parsing the description). Returns null when no live
 * misc_expenses row points at this transaction (legacy / cancelled spends).
 */
export function useMiscExpenseForTransaction(
  transactionId: string | null,
  enabled: boolean
) {
  const supabase = createClient();
  const isEnabled = enabled && !!transactionId;
  return useQuery<MiscExpenseVerification | null>({
    queryKey: ["misc-expense-by-transaction", transactionId],
    enabled: isEnabled,
    staleTime: 60_000,
    queryFn: wrapQueryFn(
      async () => {
        const { data, error } = await (supabase
          .from("misc_expenses") as any)
          .select(
            "bill_url, vendor_name, description, notes, amount, payer_source, payer_name, expense_categories(name)"
          )
          .eq("engineer_transaction_id", transactionId)
          .maybeSingle();
        if (error) throw error;
        return data ? mapMiscExpenseRow(data) : null;
      },
      { operationName: "useMiscExpenseForTransaction" }
    ),
  });
}
