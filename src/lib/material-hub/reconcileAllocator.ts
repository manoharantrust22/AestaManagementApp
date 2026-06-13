/**
 * Pure allocator for the "Reconcile usage & settle" flow.
 *
 * Turns date-windowed per-site usage totals into per-batch usage allocations
 * across a cluster's shared GROUP-STOCK pool, using:
 *   - date-windowed eligibility (a batch counts only once purchased on/before
 *     the window's as-of date),
 *   - delivered-stock capacity (only the qty actually delivered+verified as of
 *     that date can be consumed — never the ordered qty),
 *   - own-paid-batches-first FIFO (a site consumes batches it paid for, oldest
 *     first, then borrows from sibling batches),
 *   - replace-within-range semantics (pending/self_use usage inside a period's
 *     [from, asOf] range is marked for deletion and rebuilt; settled records are
 *     locked and only reduce capacity).
 *
 * No I/O — fully unit-testable. The dialog feeds it data and ships the result
 * to the `record_reconciliation_usage` RPC.
 */

const QTY_EPS = 1e-6;

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface BatchDelivery {
  /** YYYY-MM-DD */
  date: string;
  qty: number;
}

export interface BatchPoolRow {
  refCode: string;
  /** YYYY-MM-DD */
  purchaseDate: string;
  payingSiteId: string;
  payingSiteName: string | null;
  unit: string;
  /** Landed cost per unit (incl. proportional transport) — matches the RPC. */
  landedUnitCost: number;
  originalQty: number;
  /** The variant this batch row consumes — carried through to each allocation so
   *  the RPC can match the right material_purchase_expense_items row. A "PPC
   *  Cement" pool is heterogeneous: parent rows + child-grade rows + null/brand. */
  materialId: string;
  brandId: string | null;
  /** Verified deliveries (GRNs). Empty → treat the whole originalQty as
   *  available from the purchase date (legacy batches with no PO/deliveries). */
  deliveries: BatchDelivery[];
}

export interface ReconcilePeriod {
  id: string;
  /** Inclusive lower bound for the delete scope. null = open (everything up to asOf). */
  fromDate: string | null;
  /** YYYY-MM-DD inclusive upper bound; governs delivered capacity + delete scope. */
  asOfDate: string;
  /** siteId → bags consumed from the group pool in this period. */
  bagsBySite: Record<string, number>;
  workDescription?: string;
}

export interface ExistingUsage {
  id: string;
  batchRefCode: string;
  usageSiteId: string;
  payingSiteId: string;
  /** YYYY-MM-DD */
  usageDate: string;
  quantity: number;
  totalCost: number;
  isSelfUse: boolean;
  settlementStatus: string;
}

export interface ReconcileAllocationChunk {
  periodId: string;
  batchRefCode: string;
  materialId: string;
  brandId: string | null;
  usageSiteId: string;
  payingSiteId: string;
  /** YYYY-MM-DD */
  usageDate: string;
  workDescription?: string;
  quantity: number;
  unitCost: number;
  cost: number;
  isSelfUse: boolean;
}

export interface PerBatchRow {
  refCode: string;
  purchaseDate: string;
  payingSiteId: string;
  payingSiteName: string | null;
  unitCost: number;
  /** New allocations this run, by consuming site. */
  qtyBySite: Record<string, number>;
  qty: number;
  cost: number;
}

export interface GrossFlow {
  /** Site that consumed (owes). */
  debtorSiteId: string;
  /** Site that paid (is owed). */
  creditorSiteId: string;
  amount: number;
  qty: number;
}

export interface NetResult {
  /** Debtor — the site that owes. null when net is zero. */
  fromSiteId: string | null;
  /** Creditor — the site that is owed. null when net is zero. */
  toSiteId: string | null;
  amount: number;
}

export interface SiteShortfall {
  periodId: string;
  usageSiteId: string;
  requested: number;
  allocated: number;
  shortBy: number;
}

export interface ReconcilePreview {
  allocations: ReconcileAllocationChunk[];
  perBatch: PerBatchRow[];
  grossFlows: GrossFlow[];
  /** Net owed, valid for a 2-site cluster (the common case). For >2 sites use
   *  netBySite. */
  net: NetResult;
  /** siteId → balance (positive = owed to them / creditor, negative = owes). */
  netBySite: Record<string, number>;
  /** Pending/self_use record ids inside a period range — replaced on commit. */
  deleteIds: string[];
  shortfalls: SiteShortfall[];
  /** Group pool still available after this run (across all sites). */
  poolRemaining: number;
  /** periodId → group bags available to allocate WHEN that period is processed
   *  (delivered-as-of the period's date, minus locked + earlier periods). Drives
   *  the Declare-step "available as of [date]" cap + over-allocation guard. */
  periodCapacity: Record<string, number>;
}

const LOCKED_STATUSES = new Set(["in_settlement", "settled"]);

/** Delivered+verified qty available as of date D, capped at the ordered qty. */
function deliveredAsOf(b: BatchPoolRow, asOf: string): number {
  if (!b.deliveries || b.deliveries.length === 0) return b.originalQty;
  const sum = b.deliveries.reduce((s, d) => (d.date <= asOf ? s + d.qty : s), 0);
  return Math.min(sum, b.originalQty);
}

function inRange(date: string, from: string | null, to: string): boolean {
  return (from == null || date >= from) && date <= to;
}

export function computeReconcileAllocations(
  periods: ReconcilePeriod[],
  pool: BatchPoolRow[],
  existing: ExistingUsage[]
): ReconcilePreview {
  // 1. Decide which existing records get replaced (deleted) vs kept.
  const deleteIds: string[] = [];
  for (const e of existing) {
    const replaceable = !LOCKED_STATUSES.has(e.settlementStatus); // pending | self_use
    const insideSomeRange = periods.some((p) => inRange(e.usageDate, p.fromDate, p.asOfDate));
    if (replaceable && insideSomeRange) deleteIds.push(e.id);
  }
  const deleted = new Set(deleteIds);

  // Kept existing records (locked, or pending outside any range) occupy capacity.
  const usedLockedByBatch = new Map<string, number>();
  for (const e of existing) {
    if (deleted.has(e.id)) continue;
    usedLockedByBatch.set(e.batchRefCode, (usedLockedByBatch.get(e.batchRefCode) ?? 0) + e.quantity);
  }

  // 2. Allocate. Process periods oldest→newest so the shared pool depletes in order.
  const sortedPeriods = [...periods].sort(
    (a, b) => a.asOfDate.localeCompare(b.asOfDate) || (a.fromDate ?? "").localeCompare(b.fromDate ?? "")
  );
  const consumed = new Map<string, number>(); // refCode → consumed earlier this run
  const allocations: ReconcileAllocationChunk[] = [];
  const shortfalls: SiteShortfall[] = [];
  const periodCapacity: Record<string, number> = {};

  const capacityOf = (b: BatchPoolRow, asOf: string): number => {
    const cap = deliveredAsOf(b, asOf) - (usedLockedByBatch.get(b.refCode) ?? 0) - (consumed.get(b.refCode) ?? 0);
    return Math.max(0, round3(cap));
  };

  for (const p of sortedPeriods) {
    // Capacity available to THIS period (after earlier periods depleted the pool).
    periodCapacity[p.id] = round3(
      pool.reduce((s, b) => (b.purchaseDate <= p.asOfDate ? s + capacityOf(b, p.asOfDate) : s), 0)
    );
    const siteIds = Object.keys(p.bagsBySite).sort();
    for (const siteId of siteIds) {
      const bags = round3(p.bagsBySite[siteId] ?? 0);
      if (bags <= QTY_EPS) continue;

      const eligible = pool
        .filter((b) => b.purchaseDate <= p.asOfDate && capacityOf(b, p.asOfDate) > QTY_EPS)
        .sort((a, b) => {
          const aOwn = a.payingSiteId === siteId ? 0 : 1;
          const bOwn = b.payingSiteId === siteId ? 0 : 1;
          return aOwn - bOwn || a.purchaseDate.localeCompare(b.purchaseDate) || a.refCode.localeCompare(b.refCode);
        });

      let remaining = bags;
      for (const b of eligible) {
        if (remaining <= QTY_EPS) break;
        const give = round3(Math.min(remaining, capacityOf(b, p.asOfDate)));
        if (give <= QTY_EPS) continue;
        const isSelfUse = b.payingSiteId === siteId;
        allocations.push({
          periodId: p.id,
          batchRefCode: b.refCode,
          materialId: b.materialId,
          brandId: b.brandId,
          usageSiteId: siteId,
          payingSiteId: b.payingSiteId,
          usageDate: p.asOfDate,
          workDescription: p.workDescription,
          quantity: give,
          unitCost: b.landedUnitCost,
          cost: round2(give * b.landedUnitCost),
          isSelfUse,
        });
        consumed.set(b.refCode, (consumed.get(b.refCode) ?? 0) + give);
        remaining = round3(remaining - give);
      }
      if (remaining > QTY_EPS) {
        shortfalls.push({
          periodId: p.id,
          usageSiteId: siteId,
          requested: bags,
          allocated: round3(bags - remaining),
          shortBy: round3(remaining),
        });
      }
    }
  }

  // 3. Net = new cross-site allocations + kept cross-site existing records.
  const flowMap = new Map<string, GrossFlow>();
  const addFlow = (creditorSiteId: string, debtorSiteId: string, amount: number, qty: number) => {
    const key = `${creditorSiteId}__${debtorSiteId}`;
    const f = flowMap.get(key) ?? { creditorSiteId, debtorSiteId, amount: 0, qty: 0 };
    f.amount = round2(f.amount + amount);
    f.qty = round3(f.qty + qty);
    flowMap.set(key, f);
  };
  for (const a of allocations) {
    if (!a.isSelfUse) addFlow(a.payingSiteId, a.usageSiteId, a.cost, a.quantity);
  }
  for (const e of existing) {
    if (deleted.has(e.id) || e.isSelfUse || e.usageSiteId === e.payingSiteId) continue;
    addFlow(e.payingSiteId, e.usageSiteId, e.totalCost, e.quantity);
  }
  const grossFlows = [...flowMap.values()];

  const netBySite: Record<string, number> = {};
  for (const f of grossFlows) {
    netBySite[f.creditorSiteId] = round2((netBySite[f.creditorSiteId] ?? 0) + f.amount);
    netBySite[f.debtorSiteId] = round2((netBySite[f.debtorSiteId] ?? 0) - f.amount);
  }
  let net: NetResult = { fromSiteId: null, toSiteId: null, amount: 0 };
  let topCreditor: string | null = null;
  let topDebtor: string | null = null;
  for (const [site, bal] of Object.entries(netBySite)) {
    if (bal > (topCreditor ? netBySite[topCreditor] : 0)) topCreditor = site;
    if (bal < (topDebtor ? netBySite[topDebtor] : 0)) topDebtor = site;
  }
  if (topCreditor && topDebtor && netBySite[topCreditor] > QTY_EPS) {
    net = {
      fromSiteId: topDebtor,
      toSiteId: topCreditor,
      amount: round2(Math.min(netBySite[topCreditor], -netBySite[topDebtor])),
    };
  }

  // 4. Per-batch rollup (new allocations only) for the preview table.
  const perBatchMap = new Map<string, PerBatchRow>();
  for (const a of allocations) {
    const b = pool.find((x) => x.refCode === a.batchRefCode)!;
    const row =
      perBatchMap.get(a.batchRefCode) ??
      ({
        refCode: b.refCode,
        purchaseDate: b.purchaseDate,
        payingSiteId: b.payingSiteId,
        payingSiteName: b.payingSiteName,
        unitCost: b.landedUnitCost,
        qtyBySite: {},
        qty: 0,
        cost: 0,
      } as PerBatchRow);
    row.qtyBySite[a.usageSiteId] = round3((row.qtyBySite[a.usageSiteId] ?? 0) + a.quantity);
    row.qty = round3(row.qty + a.quantity);
    row.cost = round2(row.cost + a.cost);
    perBatchMap.set(a.batchRefCode, row);
  }
  const perBatch = [...perBatchMap.values()].sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));

  // 5. Pool remaining after this run (informational).
  const maxAsOf = sortedPeriods.length ? sortedPeriods[sortedPeriods.length - 1].asOfDate : "9999-12-31";
  let poolRemaining = 0;
  for (const b of pool) {
    const avail =
      deliveredAsOf(b, maxAsOf) - (usedLockedByBatch.get(b.refCode) ?? 0) - (consumed.get(b.refCode) ?? 0);
    poolRemaining = round3(poolRemaining + Math.max(0, avail));
  }

  return { allocations, perBatch, grossFlows, net, netBySite, deleteIds, shortfalls, poolRemaining, periodCapacity };
}
