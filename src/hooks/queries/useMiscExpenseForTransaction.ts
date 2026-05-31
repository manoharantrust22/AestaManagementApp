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
 *
 * Pass `null` to keep the query dormant (e.g. while the dialog is closed or the
 * row is not a misc expense). The id alone is the gate, so callers don't manage
 * a separate enabled flag.
 */
export function useMiscExpenseForTransaction(transactionId: string | null) {
  const supabase = createClient();
  return useQuery<MiscExpenseVerification | null>({
    queryKey: transactionId
      ? ["misc-expense-by-transaction", transactionId]
      : ["misc-expense-by-transaction", "_disabled"],
    enabled: !!transactionId,
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
