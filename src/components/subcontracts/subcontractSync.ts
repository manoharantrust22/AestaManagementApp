"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Tell other open tabs (e.g. Salary Settlements' MestriSettleDialog, another
 * Subcontracts tab) that subcontracts on this site changed.
 */
export function notifySubcontractsChanged(siteId: string) {
  if (typeof BroadcastChannel === "undefined") return;
  const bc = new BroadcastChannel("subcontracts-changed");
  bc.postMessage({ siteId, at: Date.now() });
  bc.close();
}

/** Invalidate every React Query cache that renders subcontract rows / money for a site. */
export function useInvalidateSubcontracts(siteId: string) {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["trades", "site", siteId] }),
        queryClient.invalidateQueries({ queryKey: ["trade-reconciliations", "site", siteId] }),
        queryClient.invalidateQueries({ queryKey: ["trade-activity", "site", siteId] }),
        queryClient.invalidateQueries({ queryKey: ["subcontracts", "site", siteId] }),
      ]),
    [queryClient, siteId]
  );
}
