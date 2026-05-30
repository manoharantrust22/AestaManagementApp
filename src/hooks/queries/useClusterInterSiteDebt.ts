"use client";

/**
 * Adapter hook for the Material Hub v2 Inter-Site Settlement page.
 *
 * The v2 page's debt math is sourced from the SAME tables the settlement engine
 * settles (`batch_usage_records`, via `useInterSiteBalances` + `useSiteSettlementSummary`),
 * NOT from the thread projection `interSiteDebt(threads)` — that only covers spot
 * purchases (standard group-PO `inter_site_usage` is an unfinished TODO in
 * useMaterialThreads). Sourcing here keeps "what's displayed" == "what gets settled".
 *
 * Returns an `InterSiteDebt`-shaped object (so the existing InterSiteBalanceCard /
 * NettingMathPanel render unchanged) plus the two reciprocal `InterSiteBalance`
 * objects the existing NetSettlementDialog needs to drive the real write.
 */

import { useMemo } from "react";
import { useSiteGroupMembership } from "@/hooks/queries/useSiteGroups";
import {
  useInterSiteBalances,
  useSiteSettlementSummary,
} from "@/hooks/queries/useInterSiteSettlements";
import { hubTokens } from "@/lib/material-hub/tokens";
import type { InterSiteDebt } from "@/lib/material-hub/nextAction";
import type { InterSiteBalance } from "@/types/material.types";

export interface ClusterSite {
  id: string;
  name: string;
  short: string;
  accent: string;
}

export interface ClusterInterSiteDebt {
  isInGroup: boolean;
  isLoading: boolean;
  isError: boolean;
  groupId: string | null;
  groupName: string | null;
  mySite: ClusterSite | null;
  otherSite: ClusterSite | null;
  /** All cluster sites keyed by id (name + short + accent) — for the batch bars. */
  siteMetaById: Map<string, ClusterSite>;
  debt: InterSiteDebt;
  youOweCount: number;
  owedToYouCount: number;
  netAmount: number;
  netPayer: ClusterSite | null;
  netReceiver: ClusterSite | null;
  /** Reciprocal balances for the me↔other pair, fed to NetSettlementDialog. */
  balanceOthersOweMe: InterSiteBalance | null;
  balanceIOweOthers: InterSiteBalance | null;
}

/** Extra accents for 3+ site clusters (me = primary, first other = pink). */
const EXTRA_ACCENTS = ["#0891b2", "#7c3aed", "#ea580c", "#0d9488", "#c026d3"];

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

const EMPTY_DEBT: InterSiteDebt = { iOwe: 0, othersOwe: 0, net: 0, detail: [] };

export function useClusterInterSiteDebt(
  siteId: string | undefined
): ClusterInterSiteDebt {
  const membership = useSiteGroupMembership(siteId);
  const groupId = membership.data?.groupId ?? null;
  const groupName = membership.data?.groupName ?? null;
  const allSites = membership.data?.allSites ?? [];

  const balancesQ = useInterSiteBalances(groupId ?? undefined);
  const summaryQ = useSiteSettlementSummary(siteId);

  return useMemo<ClusterInterSiteDebt>(() => {
    const balances = balancesQ.data ?? [];
    const summary = summaryQ.data;
    const nameById = new Map(allSites.map((s) => [s.id, s.name]));

    // Primary counterparty = the non-me site with the largest gross balance
    // (unambiguous for a 2-site cluster).
    const gross = new Map<string, number>();
    for (const b of balances) {
      if (b.creditor_site_id === siteId && b.debtor_site_id !== siteId) {
        gross.set(b.debtor_site_id, (gross.get(b.debtor_site_id) ?? 0) + b.total_amount_owed);
      } else if (b.debtor_site_id === siteId && b.creditor_site_id !== siteId) {
        gross.set(b.creditor_site_id, (gross.get(b.creditor_site_id) ?? 0) + b.total_amount_owed);
      }
    }
    let otherId: string | null = null;
    let best = -1;
    for (const [id, g] of gross) {
      if (g > best) {
        best = g;
        otherId = id;
      }
    }
    // Fall back to first sibling when no debt rows exist yet.
    if (!otherId && siteId) {
      otherId = allSites.find((s) => s.id !== siteId)?.id ?? null;
    }

    // Accents: me = primary blue, primary counterparty = pink, rest cycle.
    const siteMetaById = new Map<string, ClusterSite>();
    let extra = 0;
    for (const s of allSites) {
      const accent =
        s.id === siteId
          ? hubTokens.primary
          : s.id === otherId
          ? hubTokens.pink
          : EXTRA_ACCENTS[extra++ % EXTRA_ACCENTS.length];
      siteMetaById.set(s.id, { id: s.id, name: s.name, short: siteShort(s.name), accent });
    }

    const mySite: ClusterSite | null = siteId
      ? siteMetaById.get(siteId) ?? {
          id: siteId,
          name: summary?.site_name ?? "This site",
          short: siteShort(summary?.site_name),
          accent: hubTokens.primary,
        }
      : null;
    const otherSite: ClusterSite | null = otherId
      ? siteMetaById.get(otherId) ?? {
          id: otherId,
          name: nameById.get(otherId) ?? "Cluster",
          short: siteShort(nameById.get(otherId)),
          accent: hubTokens.pink,
        }
      : null;

    // Build the debt detail + totals from balances (filtered to pairs involving me).
    const detail: InterSiteDebt["detail"] = [];
    let iOwe = 0;
    let othersOwe = 0;
    let balanceOthersOweMe: InterSiteBalance | null = null;
    let balanceIOweOthers: InterSiteBalance | null = null;

    for (const b of balances) {
      const othersOweMe = b.creditor_site_id === siteId && b.debtor_site_id !== siteId;
      const iOweThem = b.debtor_site_id === siteId && b.creditor_site_id !== siteId;
      if (!othersOweMe && !iOweThem) continue;

      if (othersOweMe) {
        othersOwe += b.total_amount_owed;
        if (b.debtor_site_id === otherId) balanceOthersOweMe = b;
        for (const m of b.material_breakdown) {
          detail.push({
            from_site: b.debtor_site_id,
            to_site: siteId!,
            used: m.quantity,
            value: m.total_amount,
            materialName: m.material_name,
          });
        }
      } else {
        iOwe += b.total_amount_owed;
        if (b.creditor_site_id === otherId) balanceIOweOthers = b;
        for (const m of b.material_breakdown) {
          detail.push({
            from_site: siteId!,
            to_site: b.creditor_site_id,
            used: m.quantity,
            value: m.total_amount,
            materialName: m.material_name,
          });
        }
      }
    }

    const debt: InterSiteDebt = { iOwe, othersOwe, net: othersOwe - iOwe, detail };
    const netAmount = Math.round(Math.abs(othersOwe - iOwe) * 100) / 100;
    const iOweMore = iOwe > othersOwe;
    const netPayer = iOweMore ? mySite : otherSite;
    const netReceiver = iOweMore ? otherSite : mySite;

    // Zero-stub a missing direction so the dialog always has two balances.
    const stub = (creditorId: string, debtorId: string): InterSiteBalance => ({
      site_group_id: groupId ?? "",
      group_name: groupName ?? "",
      creditor_site_id: creditorId,
      creditor_site_name: nameById.get(creditorId) ?? "",
      debtor_site_id: debtorId,
      debtor_site_name: nameById.get(debtorId) ?? "",
      year: new Date().getFullYear(),
      week_number: 0,
      week_start: "",
      week_end: "",
      transaction_count: 0,
      material_count: 0,
      total_quantity: 0,
      total_amount_owed: 0,
      is_settled: false,
      material_breakdown: [],
    });
    if (siteId && otherId) {
      if (!balanceOthersOweMe) balanceOthersOweMe = stub(siteId, otherId);
      if (!balanceIOweOthers) balanceIOweOthers = stub(otherId, siteId);
    }

    return {
      isInGroup: !!membership.data?.isInGroup && !!groupId,
      isLoading: membership.isLoading || balancesQ.isLoading || summaryQ.isLoading,
      isError: balancesQ.isError || summaryQ.isError,
      groupId,
      groupName,
      mySite,
      otherSite,
      siteMetaById,
      debt,
      youOweCount: summary?.you_owe_count ?? 0,
      owedToYouCount: summary?.owed_to_you_count ?? 0,
      netAmount,
      netPayer,
      netReceiver,
      balanceOthersOweMe,
      balanceIOweOthers,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    balancesQ.data,
    balancesQ.isLoading,
    balancesQ.isError,
    summaryQ.data,
    summaryQ.isLoading,
    summaryQ.isError,
    membership.data,
    membership.isLoading,
    siteId,
    groupId,
    groupName,
  ]);
}

export { EMPTY_DEBT };
