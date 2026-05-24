"use client";

/**
 * Top-of-page summary for /site/inter-site-settlement. Shows the redesigned
 * netting math layered above the existing 3-tab page. Composes:
 *   - InterSiteBalanceCard (dark gradient You-owe / NET / Others-owe-you)
 *   - NettingMathPanel ("How this nets · worked example")
 *
 * Data source: useMaterialThreads → interSiteDebt() (consistent with the Hub).
 * Doesn't duplicate the existing settlement-code/weekly-batch features below.
 */

import { useMemo } from "react";
import { Box } from "@mui/material";
import { useSelectedSite } from "@/contexts/SiteContext";
import { useSiteGroupMembership } from "@/hooks/queries/useSiteGroups";
import { useMaterialThreads } from "@/hooks/queries/useMaterialThreads";
import { interSiteDebt } from "@/lib/material-hub/nextAction";
import { hubTokens } from "@/lib/material-hub/tokens";
import InterSiteBalanceCard from "./InterSiteBalanceCard";
import NettingMathPanel from "./NettingMathPanel";

function siteShort(name: string | null | undefined): string {
  if (!name) return "—";
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 3)
    .join("")
    .toUpperCase();
}

export default function MaterialHubInterSiteSummary() {
  const { selectedSite } = useSelectedSite();
  const siteId = selectedSite?.id;
  const siteGroupId = selectedSite?.site_group_id ?? null;

  const { data: groupMembership } = useSiteGroupMembership(siteId);
  const { threads } = useMaterialThreads(siteId, siteGroupId);

  const debt = useMemo(
    () => interSiteDebt(threads, siteId ?? ""),
    [threads, siteId]
  );

  // Find the "other" cluster site (the primary counterparty). For 2-site
  // clusters this is unambiguous; for larger clusters this picks the site
  // with the biggest absolute debt balance vs me.
  const otherSite = useMemo(() => {
    if (!groupMembership?.allSites || !siteId) return null;
    const counterparties = new Map<string, { name: string; gross: number }>();
    for (const d of debt.detail) {
      const otherId: string = d.to_site === siteId ? d.from_site : d.to_site;
      if (otherId === siteId) continue;
      const existing = counterparties.get(otherId) ?? { name: "", gross: 0 };
      existing.gross += d.value;
      counterparties.set(otherId, existing);
    }
    let best: { id: string; name: string; gross: number } | null = null;
    for (const [id, { gross }] of counterparties) {
      const siteInfo = groupMembership.allSites.find((s) => s.id === id);
      if (!siteInfo) continue;
      if (!best || gross > best.gross) {
        best = { id, name: siteInfo.name, gross };
      }
    }
    // Fall back: first sibling site if no debt detail yet
    if (!best) {
      const sibling = groupMembership.allSites.find((s) => s.id !== siteId);
      if (sibling) return { id: sibling.id, name: sibling.name };
    }
    return best ? { id: best.id, name: best.name } : null;
  }, [debt, groupMembership, siteId]);

  // Don't render if not in a group
  if (!siteGroupId || !groupMembership) return null;

  return (
    <Box sx={{ marginBottom: "16px" }}>
      <InterSiteBalanceCard debt={debt} />
      <NettingMathPanel
        debt={debt}
        mySiteId={siteId ?? ""}
        mySiteName={selectedSite?.name ?? "This site"}
        mySiteShort={siteShort(selectedSite?.name)}
        mySiteAccent={hubTokens.primary}
        otherSiteName={otherSite?.name ?? "Cluster"}
        otherSiteShort={siteShort(otherSite?.name)}
        otherSiteAccent={hubTokens.pink}
      />
    </Box>
  );
}
