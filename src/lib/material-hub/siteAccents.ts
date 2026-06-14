/**
 * Pure helpers for colouring a shared group batch's per-site usage split — the
 * data behind the Hub's segmented "who used this batch" bar (PerSiteUsageBar).
 *
 * The colour convention mirrors the inter-site settlement page
 * (useClusterInterSiteDebt): the viewing site is the primary blue, the first
 * other site is pink, and any further sites cycle a fixed accent palette — so a
 * site reads the same colour across the Hub.
 */

import { hubTokens } from "./tokens";

/** Accents for the 3rd+ site in a cluster (viewing = blue, first other = pink). */
export const SITE_ACCENTS = ["#0891b2", "#7c3aed", "#ea580c", "#0d9488", "#c026d3"];

/** Short tag from a site name, e.g. "Srinivasan House & Shop" → "SHS". */
export function siteShort(name: string | null | undefined): string {
  if (!name) return "—";
  return (
    name
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 3)
      .join("")
      .toUpperCase() || "—"
  );
}

/**
 * Deterministic site_id → accent map. Viewing site → primary blue; the first
 * non-viewing site (in the given order) → pink; the rest cycle SITE_ACCENTS.
 */
export function assignSiteAccents(
  orderedSiteIds: string[],
  viewingSiteId?: string | null
): Map<string, string> {
  const m = new Map<string, string>();
  let extra = 0;
  let firstOtherTaken = false;
  for (const id of orderedSiteIds) {
    if (id === viewingSiteId) {
      m.set(id, hubTokens.primary);
    } else if (!firstOtherTaken) {
      m.set(id, hubTokens.pink);
      firstOtherTaken = true;
    } else {
      m.set(id, SITE_ACCENTS[extra++ % SITE_ACCENTS.length]);
    }
  }
  return m;
}

export interface PerSiteUsed {
  site_id: string;
  site_name: string;
  /** Qty this site received from the batch (may be 0 for a pure consumer). */
  received?: number;
  /** Qty this site consumed from the batch. */
  used: number;
}

export interface UsageSegment {
  siteId: string;
  name: string;
  short: string;
  used: number;
  accent: string;
  /** Width as a % of the batch's total received. */
  widthPct: number;
}

/**
 * Build the coloured segments for the usage bar — one per site that consumed
 * (used > 0), in the given order, each carrying its accent and width (% of
 * `received`). Sites are coloured by `assignSiteAccents` (so the accent stays
 * stable even for a 0-used site), but only used>0 rows become segments.
 */
export function usageSegments(
  perSite: PerSiteUsed[],
  received: number,
  viewingSiteId?: string | null
): UsageSegment[] {
  const accents = assignSiteAccents(
    perSite.map((p) => p.site_id),
    viewingSiteId
  );
  const out: UsageSegment[] = [];
  for (const p of perSite) {
    const used = Number(p.used) || 0;
    if (used <= 0) continue;
    out.push({
      siteId: p.site_id,
      name: p.site_name,
      short: siteShort(p.site_name),
      used,
      accent: accents.get(p.site_id) ?? hubTokens.subtle,
      widthPct: received > 0 ? Math.min(100, (used / received) * 100) : 0,
    });
  }
  return out;
}
