import { resolvePoolHost, TradeTea } from "./teaPoolHost";

export interface SitePoolTea {
  siteId: string;
  /** Pool host this site's tea bill belongs to (NULL -> defaultHost). */
  poolHost: string | null;
  amount: number;
  /** Present day_units keyed by trade category id (named + market). */
  unitsByTrade: Record<string, number>;
}

export interface TeaSplitInput {
  defaultHost: string;
  trades: TradeTea[];
  sites: SitePoolTea[];
}

export interface TradeShare {
  tradeCategoryId: string;
  tradeName: string;
  amount: number;
}

export interface SiteSplit {
  siteId: string;
  perTrade: TradeShare[];
}

export function computeTeaSplitPreview(input: TeaSplitInput): SiteSplit[] {
  const { defaultHost, trades, sites } = input;
  const byId = new Map(trades.map((t) => [t.id, t]));
  return sites.map((site) => {
    const host = site.poolHost ?? defaultHost;
    const members = trades.filter((t) => t.teaMode !== "off" && resolvePoolHost(t, defaultHost) === host);
    const units = members.map((m) => ({ m, u: site.unitsByTrade[m.id] ?? 0 }));
    const total = units.reduce((a, x) => a + x.u, 0);
    let perTrade: TradeShare[];
    if (total > 0) {
      perTrade = units
        .filter((x) => x.u > 0)
        .map((x) => ({
          tradeCategoryId: x.m.id,
          tradeName: x.m.name,
          amount: Math.round(site.amount * (x.u / total)),
        }));
    } else {
      const hostTrade = byId.get(host);
      perTrade = hostTrade
        ? [{ tradeCategoryId: host, tradeName: hostTrade.name, amount: Math.round(site.amount) }]
        : [];
    }
    return { siteId: site.siteId, perTrade };
  });
}
