/**
 * Pure derivation: turn existing trade + reconciliation data into the money
 * summaries the attendance strip and trade-chip dot need. No React, no styling.
 *
 * agreed = Σ total_value (via reconciliation.quotedAmount, falling back to the
 * contract's own totalValue); spent = Σ amount_paid; severity reuses the workforce
 * exposure rollup. "No agreed amount" (agreed === 0) is the daily-wage-only signal.
 */
import { rollupTasks, rollupSeverity, type Severity, type RollupTask } from "./exposure";
import type { Trade, TradeContract, ContractReconciliation } from "@/types/trade.types";

export interface ContractMoneySummary {
  contractId: string;
  title: string;
  tradeName: string;
  agreed: number;
  spent: number;
  /** agreed − spent; negative means overpaid. */
  remaining: number;
  overpaid: boolean;
  hasAgreedAmount: boolean;
  severity: Severity;
}

export interface TradeMoneySummary {
  tradeCategoryId: string;
  tradeName: string;
  hasDetailedContract: boolean;
  hasAgreedAmount: boolean;
  agreed: number;
  spent: number;
  remaining: number;
  severity: Severity;
  contractCount: number;
}

export interface AssembledSummaries {
  byCategoryId: Map<string, TradeMoneySummary>;
  byContractId: Map<string, ContractMoneySummary>;
  /** Category ids that have ≥1 contract but Σ agreed === 0 (drives the amber chip dot). */
  noAgreedAmountCategoryIds: Set<string>;
}

function taskFor(c: TradeContract, recon?: ContractReconciliation): RollupTask {
  const quoted = recon?.quotedAmount ?? c.totalValue ?? 0;
  const paid = recon?.amountPaid ?? 0;
  const work = c.workProgressPercent == null ? null : c.workProgressPercent / 100;
  return { quoted, paid, work };
}

export function buildContractMoneySummary(
  c: TradeContract,
  tradeName: string,
  recon?: ContractReconciliation
): ContractMoneySummary {
  const r = rollupTasks([taskFor(c, recon)]);
  const remaining = r.quoted - r.paid;
  return {
    contractId: c.id,
    title: c.title,
    tradeName,
    agreed: r.quoted,
    spent: r.paid,
    remaining,
    // "Overpaid" only makes sense against a real agreed amount — ₹0 agreed is
    // daily-wage spend, not an overpayment.
    overpaid: r.quoted > 0 && remaining < 0,
    hasAgreedAmount: r.quoted > 0,
    severity: rollupSeverity(r),
  };
}

export function buildTradeMoneySummary(
  trade: Trade,
  reconMap: Map<string, ContractReconciliation>
): TradeMoneySummary {
  const r = rollupTasks(trade.contracts.map((c) => taskFor(c, reconMap.get(c.id))));
  const remaining = r.quoted - r.paid;
  return {
    tradeCategoryId: trade.category.id,
    tradeName: trade.category.name,
    hasDetailedContract: trade.contracts.some((c) => c.laborTrackingMode === "detailed"),
    hasAgreedAmount: r.quoted > 0,
    agreed: r.quoted,
    spent: r.paid,
    remaining,
    severity: rollupSeverity(r),
    contractCount: trade.contracts.length,
  };
}

export function assembleSummaries(
  trades: Trade[] | undefined,
  reconMap: Map<string, ContractReconciliation> | undefined
): AssembledSummaries {
  const map = reconMap ?? new Map<string, ContractReconciliation>();
  const byCategoryId = new Map<string, TradeMoneySummary>();
  const byContractId = new Map<string, ContractMoneySummary>();
  const noAgreedAmountCategoryIds = new Set<string>();

  for (const trade of trades ?? []) {
    const tradeSummary = buildTradeMoneySummary(trade, map);
    byCategoryId.set(trade.category.id, tradeSummary);
    if (trade.contracts.length > 0 && !tradeSummary.hasAgreedAmount) {
      noAgreedAmountCategoryIds.add(trade.category.id);
    }
    for (const c of trade.contracts) {
      byContractId.set(c.id, buildContractMoneySummary(c, trade.category.name, map.get(c.id)));
    }
  }

  return { byCategoryId, byContractId, noAgreedAmountCategoryIds };
}
