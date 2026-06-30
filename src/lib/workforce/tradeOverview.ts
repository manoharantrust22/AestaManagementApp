/**
 * Pure cross-site aggregator for the manager overview. Flattens per-site trade
 * money summaries into rows, classifies each into an attention tier, sorts
 * attention-first, and totals. No React.
 */
import type { TradeMoneySummary } from "./tradeContractSummary";

export type OverviewTier = "no_contract" | "blind" | "overpaid" | "healthy";

export interface OverviewRow {
  siteId: string;
  siteName: string;
  tradeCategoryId: string;
  tradeName: string;
  agreed: number;
  spent: number;
  remaining: number;
  contractCount: number;
  tier: OverviewTier;
}

export interface OverviewTotals {
  agreed: number;
  spent: number;
  remaining: number;
  /** Trades running blind = no_contract + blind (₹0 agreed). */
  blindCount: number;
}

export interface SiteSummaries {
  siteId: string;
  siteName: string;
  summaries: TradeMoneySummary[];
}

export function tierForSummary(s: TradeMoneySummary): OverviewTier {
  if (s.contractCount === 0) return "no_contract";
  if (!s.hasAgreedAmount) return "blind";
  if (s.spent > s.agreed) return "overpaid";
  return "healthy";
}

const TIER_RANK: Record<OverviewTier, number> = {
  no_contract: 0,
  blind: 1,
  overpaid: 2,
  healthy: 3,
};

export function buildTradeOverview(perSite: SiteSummaries[]): {
  rows: OverviewRow[];
  totals: OverviewTotals;
} {
  const rows: OverviewRow[] = [];
  for (const { siteId, siteName, summaries } of perSite) {
    for (const s of summaries) {
      rows.push({
        siteId,
        siteName,
        tradeCategoryId: s.tradeCategoryId,
        tradeName: s.tradeName,
        agreed: s.agreed,
        spent: s.spent,
        remaining: s.remaining,
        contractCount: s.contractCount,
        tier: tierForSummary(s),
      });
    }
  }
  rows.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || b.spent - a.spent);
  const totals: OverviewTotals = {
    agreed: rows.reduce((n, r) => n + r.agreed, 0),
    spent: rows.reduce((n, r) => n + r.spent, 0),
    remaining: rows.reduce((n, r) => n + r.remaining, 0),
    blindCount: rows.filter((r) => r.tier === "no_contract" || r.tier === "blind").length,
  };
  return { rows, totals };
}
