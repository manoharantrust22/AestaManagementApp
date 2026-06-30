/**
 * buildContractTeaModel — pure rows → save-model builder for contract-aware tea.
 *
 * Both the interactive `ContractTeaAllocator` and the batch `TeaBackfillDialog`
 * turn a list of crew rows (the implicit per-site "Regular crew (mesthri)" row +
 * one row per activated contract that worked) plus a single tea total into the
 * exact shape `saveContractTeaEntry` persists: per-site `allocations[]` +
 * per-contract `selections[]` + `totalDayUnits`. Keeping this in one place means
 * the live allocator and the backfill emit byte-identical records — no drift.
 *
 * Pure + dependency-light (only the split math) so it unit-tests in isolation.
 */

import { computeContractTeaSplit, type TeaSplitRow } from "@/lib/tea/contractTeaSplit";
import type {
  SiteAllocationInput,
  ContractSelectionInput,
} from "@/lib/tea/saveContractTeaEntry";

export interface ContractTeaModel {
  total: number;
  totalDayUnits: number;
  allocations: SiteAllocationInput[];
  selections: ContractSelectionInput[];
}

/** Minimal row the model needs (a subset of the allocator's render row). */
export interface ContractTeaModelRow {
  key: string;
  siteId: string;
  presenceKind: "package" | "subcontract" | "mesthri";
  /** package_id / subcontract_id; null for the implicit mesthri row. */
  refId: string | null;
  tradeCategoryId: string | null;
  manDays: number;
}

export interface BuildContractTeaModelOptions {
  /** Per-row include flag (default true when absent). */
  included?: Record<string, boolean>;
  /** Per-row fixed rupee amount (null/absent ⇒ auto-split by man-days). */
  overrides?: Record<string, number | null>;
}

/**
 * Build the save model from rows + a tea total. Returns null when there are no
 * rows (nothing to split). `sites` controls allocation order/inclusion: a site
 * gets an allocation row only when it has an amount or included man-days.
 */
export function buildContractTeaModel(
  total: number,
  rows: ContractTeaModelRow[],
  sites: { id: string; name?: string }[],
  options: BuildContractTeaModelOptions = {}
): ContractTeaModel | null {
  if (rows.length === 0) return null;
  const { included = {}, overrides = {} } = options;

  const splitRows: TeaSplitRow[] = rows.map((r) => ({
    key: r.key,
    siteId: r.siteId,
    manDays: r.manDays,
    included: included[r.key] ?? true,
    overrideAmount: overrides[r.key] ?? null,
  }));
  const split = computeContractTeaSplit(total, splitRows);

  const amountByKey = new Map<string, number>();
  for (const r of split.rows) amountByKey.set(r.key, r.amount);

  // Per-site allocation = Σ included row amounts; included man-days for the site.
  const bySiteUnits = new Map<string, number>();
  const bySiteWorkers = new Map<string, number>();
  for (const r of rows) {
    if (!(included[r.key] ?? true)) continue;
    bySiteUnits.set(r.siteId, (bySiteUnits.get(r.siteId) ?? 0) + r.manDays);
    bySiteWorkers.set(r.siteId, (bySiteWorkers.get(r.siteId) ?? 0) + r.manDays);
  }
  const allocations: SiteAllocationInput[] = [];
  for (const site of sites) {
    const amount = split.bySite[site.id] ?? 0;
    const units = bySiteUnits.get(site.id) ?? 0;
    if (amount <= 0 && units <= 0) continue;
    allocations.push({
      site_id: site.id,
      day_units_sum: Math.round(units * 100) / 100,
      worker_count: Math.round(bySiteWorkers.get(site.id) ?? 0),
      allocation_percentage:
        split.total > 0 ? Math.round((amount / split.total) * 100) : 0,
      allocated_amount: amount,
    });
  }

  const selections: ContractSelectionInput[] = rows.map((r) => ({
    site_id: r.siteId,
    presence_kind: r.presenceKind,
    ref_id: r.refId,
    trade_category_id: r.tradeCategoryId,
    man_days: Math.round(r.manDays * 100) / 100,
    allocated_amount: amountByKey.get(r.key) ?? 0,
    is_included: included[r.key] ?? true,
    is_amount_override: (overrides[r.key] ?? null) != null,
  }));

  const totalDayUnits = rows
    .filter((r) => included[r.key] ?? true)
    .reduce((s, r) => s + r.manDays, 0);

  return {
    total: split.total,
    totalDayUnits: Math.round(totalDayUnits * 100) / 100,
    allocations,
    selections,
  };
}
