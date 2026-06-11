"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";

/** Another live settlement that looks like a duplicate of the one being viewed. */
export interface PossibleDuplicateSettlement {
  group_id: string;
  settlement_reference: string;
  settlement_date: string;
  total_amount: number;
  laborer_count: number | null;
  created_by_name: string | null;
  created_at: string;
}

/**
 * List OTHER live settlement_groups that match this one on
 * (site, date, total_amount, laborer_count) — the duplicate-spend signature —
 * via the find_possible_duplicate_settlements RPC. Powers the "Possible
 * duplicate" warning chip in the Spend details dialog. Detection only.
 *
 * Pass null to keep the query dormant. Returns [] when nothing matches.
 */
export function usePossibleDuplicate(groupId: string | null) {
  const supabase = createClient();
  return useQuery<PossibleDuplicateSettlement[]>({
    queryKey: groupId
      ? ["possible-duplicate-settlements", groupId]
      : ["possible-duplicate-settlements", "_disabled"],
    enabled: !!groupId,
    staleTime: 60_000,
    queryFn: wrapQueryFn(
      async () => {
        // Cast: this RPC is newer than the committed generated Supabase types.
        const { data, error } = await (supabase.rpc as any)(
          "find_possible_duplicate_settlements",
          { p_group_id: groupId }
        );
        if (error) throw error;
        return (data as PossibleDuplicateSettlement[] | null) ?? [];
      },
      { operationName: "usePossibleDuplicate" }
    ),
  });
}
