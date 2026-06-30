"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Box } from "@mui/material";
import { useRouter } from "next/navigation";
import { useSitesData } from "@/contexts/SiteContext/SitesDataContext";
import { useSiteActions } from "@/contexts/SiteContext/SiteActionsContext";
import { useTradeContractSummaries } from "@/hooks/queries/useTradeContractSummary";
import { buildTradeOverview, type SiteSummaries } from "@/lib/workforce/tradeOverview";
import type { TradeMoneySummary } from "@/lib/workforce/tradeContractSummary";
import { TradeOverviewTable } from "./TradeOverviewTable";

/**
 * One collector per site — calls useTradeContractSummaries(siteId) (so the hook
 * is never called inside a .map over a dynamic list, which would break the Rules
 * of Hooks) and reports the site's trade summaries up to the parent. Renders nothing.
 */
function SiteSummaryCollector({
  siteId,
  onLoaded,
}: {
  siteId: string;
  onLoaded: (siteId: string, summaries: TradeMoneySummary[]) => void;
}) {
  const summ = useTradeContractSummaries(siteId);
  const rows = useMemo(() => Array.from(summ.byCategoryId.values()), [summ.byCategoryId]);
  React.useEffect(() => {
    if (!summ.isLoading) onLoaded(siteId, rows);
  }, [summ.isLoading, rows, siteId, onLoaded]);
  return null;
}

/**
 * Manager cross-site overview: every accessible site × trade with agreed/spent/
 * remaining, flagged attention-first (no contract / ₹0 agreed / overpaid → top).
 * Click a row to switch the selected site and jump into its /site/trades workspace.
 */
export function CrossSiteTradeOverview() {
  const { sites } = useSitesData();
  const { setSelectedSite } = useSiteActions();
  const router = useRouter();
  const [bySite, setBySite] = useState<Map<string, TradeMoneySummary[]>>(new Map());

  const handleLoaded = useCallback((siteId: string, summaries: TradeMoneySummary[]) => {
    setBySite((prev) => {
      const next = new Map(prev);
      next.set(siteId, summaries);
      return next;
    });
  }, []);

  const { rows, totals } = useMemo(() => {
    const perSite: SiteSummaries[] = sites.map((s) => ({
      siteId: s.id,
      siteName: s.name,
      summaries: bySite.get(s.id) ?? [],
    }));
    return buildTradeOverview(perSite);
  }, [sites, bySite]);

  return (
    <Box>
      {sites.map((s) => (
        <SiteSummaryCollector key={s.id} siteId={s.id} onLoaded={handleLoaded} />
      ))}
      <TradeOverviewTable
        rows={rows}
        totals={totals}
        onOpenRow={(row) => {
          const site = sites.find((x) => x.id === row.siteId);
          if (site) setSelectedSite(site);
          router.push("/site/trades");
        }}
      />
    </Box>
  );
}
