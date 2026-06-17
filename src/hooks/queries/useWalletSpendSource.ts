"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  getWalletSpendSource,
  type WalletSpendSource,
} from "@/lib/services/walletSpendReverseService";

/**
 * Resolve which source (material/misc/rental/tea/salary/none) a wallet spend was
 * created from, so the Spend detail dialog can show the right reverse actions.
 * Pass null to disable (e.g. dialog closed or not a spend).
 */
export function useWalletSpendSource(spendId: string | null) {
  const supabase = createClient();
  return useQuery<WalletSpendSource>({
    queryKey: ["wallet-spend-source", spendId],
    enabled: !!spendId,
    staleTime: 60_000,
    queryFn: () => getWalletSpendSource(supabase, spendId as string),
  });
}
