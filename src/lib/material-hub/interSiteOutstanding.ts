/**
 * Consolidated inter-site "outstanding" model.
 *
 * The Hub's inter-site debt lives in TWO places once a reconcile has run:
 *  1. `batch_usage_records` still `pending` — cross-site usage logged but NOT yet
 *     put into a settlement (settleable fresh via the netting dialog).
 *  2. `inter_site_material_settlements` raised but unpaid — a settlement WAS
 *     generated (usage rows flipped to `in_settlement`) but no money moved; these
 *     no longer appear in the pending-usage balance, so any view that reads only
 *     `useInterSiteBalances` under-reports the true debt (the "+₹0" KPI bug).
 *
 * This module unifies both into directed `OutstandingLeg`s (debtor owes creditor)
 * and nets them per site-pair, so a card/strip/KPI can answer "for this material,
 * who owes whom, how much, all batches together" honestly. Pure + side-effect
 * free so it is unit-tested in isolation.
 */

import type {
  InterSiteBalance,
} from "@/types/material.types";

/** One directed debt: `debtor` owes `creditor` `amount` for `material`. */
export interface OutstandingLeg {
  creditorSiteId: string;
  creditorName: string;
  debtorSiteId: string;
  debtorName: string;
  materialId: string;
  materialName: string;
  amount: number;
  /** true = from a raised-but-unpaid settlement; false = not-yet-raised usage. */
  raised: boolean;
  settlementId?: string;
  settlementCode?: string;
}

/** A raised-but-unpaid settlement leg, as returned by useUnpaidInterSiteSettlements. */
export interface UnpaidSettlementLeg {
  settlement_id: string;
  settlement_code: string;
  creditor_site_id: string;
  creditor_site_name: string;
  debtor_site_id: string;
  debtor_site_name: string;
  material_id: string;
  material_name: string;
  amount: number;
}

export interface OutstandingNetLine {
  owerSiteId: string;
  owerName: string;
  owedSiteId: string;
  owedName: string;
  amount: number;
}

export interface OutstandingSummary {
  /** Sum of the net amounts across all pairs (always ≥ 0). */
  total: number;
  netLines: OutstandingNetLine[];
  /** Distinct raised settlement ids contributing (for the Settle action). */
  settlementIds: string[];
  hasRaised: boolean;
  hasUnraised: boolean;
  /** Viewer-centric figures (0 unless viewerSiteId given). net = othersOwe − iOwe. */
  iOwe: number;
  othersOwe: number;
  net: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Adapt pending-usage balances (useInterSiteBalances) into outstanding legs. */
export function legsFromBalances(balances: InterSiteBalance[]): OutstandingLeg[] {
  const legs: OutstandingLeg[] = [];
  for (const b of balances) {
    if (b.is_settled) continue;
    for (const m of b.material_breakdown ?? []) {
      if (!m.total_amount) continue;
      legs.push({
        creditorSiteId: b.creditor_site_id,
        creditorName: b.creditor_site_name,
        debtorSiteId: b.debtor_site_id,
        debtorName: b.debtor_site_name,
        materialId: m.material_id,
        materialName: m.material_name,
        amount: Number(m.total_amount),
        raised: false,
      });
    }
  }
  return legs;
}

/** Adapt raised-but-unpaid settlement legs into outstanding legs. */
export function legsFromUnpaidSettlements(rows: UnpaidSettlementLeg[]): OutstandingLeg[] {
  return rows
    .filter((r) => r.amount > 0)
    .map((r) => ({
      creditorSiteId: r.creditor_site_id,
      creditorName: r.creditor_site_name,
      debtorSiteId: r.debtor_site_id,
      debtorName: r.debtor_site_name,
      materialId: r.material_id,
      materialName: r.material_name,
      amount: Number(r.amount),
      raised: true,
      settlementId: r.settlement_id,
      settlementCode: r.settlement_code,
    }));
}

/**
 * Net the legs per site-pair and summarise. When `familyMaterialIds` is given,
 * only legs for those materials are considered (the per-material Hub strip);
 * omit it for the cluster-wide KPI.
 */
export function summarizeOutstanding(
  legs: OutstandingLeg[],
  opts?: { familyMaterialIds?: Set<string>; viewerSiteId?: string }
): OutstandingSummary {
  const fam = opts?.familyMaterialIds;
  const filtered = fam ? legs.filter((l) => fam.has(l.materialId)) : legs;

  // Sum each directed (debtor → creditor) flow.
  const dir = new Map<
    string,
    { debtorId: string; debtorName: string; creditorId: string; creditorName: string; amount: number }
  >();
  for (const l of filtered) {
    const key = `${l.debtorSiteId}>${l.creditorSiteId}`;
    const e =
      dir.get(key) ?? {
        debtorId: l.debtorSiteId,
        debtorName: l.debtorName,
        creditorId: l.creditorSiteId,
        creditorName: l.creditorName,
        amount: 0,
      };
    e.amount += l.amount;
    if (l.debtorName) e.debtorName = l.debtorName;
    if (l.creditorName) e.creditorName = l.creditorName;
    dir.set(key, e);
  }

  // Net opposing directions per unordered pair.
  const seen = new Set<string>();
  const netLines: OutstandingNetLine[] = [];
  for (const [key, e] of dir) {
    const revKey = `${e.creditorId}>${e.debtorId}`;
    if (seen.has(key) || seen.has(revKey)) continue;
    seen.add(key);
    seen.add(revKey);
    const forward = e.amount; // debtor owes creditor
    const back = dir.get(revKey);
    const backward = back?.amount ?? 0; // creditor owes debtor
    const net = forward - backward;
    if (Math.abs(net) < 0.005) continue;
    if (net > 0) {
      netLines.push({
        owerSiteId: e.debtorId,
        owerName: e.debtorName,
        owedSiteId: e.creditorId,
        owedName: e.creditorName,
        amount: round2(net),
      });
    } else {
      netLines.push({
        owerSiteId: e.creditorId,
        owerName: e.creditorName,
        owedSiteId: e.debtorId,
        owedName: e.debtorName,
        amount: round2(-net),
      });
    }
  }
  netLines.sort((a, b) => b.amount - a.amount);

  const settlementIds = Array.from(
    new Set(filtered.filter((l) => l.settlementId).map((l) => l.settlementId!))
  );

  let iOwe = 0;
  let othersOwe = 0;
  const viewer = opts?.viewerSiteId;
  if (viewer) {
    for (const l of filtered) {
      if (l.debtorSiteId === viewer) iOwe += l.amount;
      else if (l.creditorSiteId === viewer) othersOwe += l.amount;
    }
  }

  return {
    total: round2(netLines.reduce((s, n) => s + n.amount, 0)),
    netLines,
    settlementIds,
    hasRaised: filtered.some((l) => l.raised),
    hasUnraised: filtered.some((l) => !l.raised),
    iOwe: round2(iOwe),
    othersOwe: round2(othersOwe),
    net: round2(othersOwe - iOwe),
  };
}
