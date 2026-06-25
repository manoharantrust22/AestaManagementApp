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
  return sites.map((site) => {
    const host = site.poolHost ?? defaultHost;
    const members = trades
      .filter((t) => t.teaMode !== "off" && resolvePoolHost(t, defaultHost) === host)
      .sort((a, b) => {
        const ah = a.id === host ? 0 : 1;
        const bh = b.id === host ? 0 : 1;
        if (ah !== bh) return ah - bh; // host first
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // then by id
      });
    const total = members.reduce((s, m) => s + (site.unitsByTrade[m.id] ?? 0), 0);
    const perTrade: TradeShare[] = [];
    if (total > 0) {
      let running = 0;
      let prevCum = 0;
      for (const m of members) {
        running += site.unitsByTrade[m.id] ?? 0;
        const cum = Math.round(site.amount * (running / total));
        const share = cum - prevCum;
        prevCum = cum;
        if (share !== 0) perTrade.push({ tradeCategoryId: m.id, tradeName: m.name, amount: share });
      }
    } else {
      const first = members[0];
      if (first) perTrade.push({ tradeCategoryId: first.id, tradeName: first.name, amount: Math.round(site.amount) });
    }
    return { siteId: site.siteId, perTrade };
  });
}
