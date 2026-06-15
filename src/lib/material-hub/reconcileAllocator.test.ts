import { describe, it, expect } from "vitest";
import {
  computeReconcileAllocations,
  summarizeReconcileUsage,
  type BatchPoolRow,
  type ExistingUsage,
  type ReconcileAllocationChunk,
  type ReconcilePeriod,
} from "./reconcileAllocator";

const SRINI = "site-srini";
const PADMA = "site-padma";

const PPC = "mat-ppc";

function batch(over: Partial<BatchPoolRow> & { refCode: string }): BatchPoolRow {
  return {
    purchaseDate: "2025-12-01",
    payingSiteId: SRINI,
    payingSiteName: "Srinivasan",
    unit: "bag",
    landedUnitCost: 280,
    originalQty: 30,
    materialId: PPC,
    brandId: null,
    deliveries: [{ date: over.purchaseDate ?? "2025-12-01", qty: over.originalQty ?? 30 }],
    ...over,
  };
}

function period(over: Partial<ReconcilePeriod> & { id: string; asOfDate: string }): ReconcilePeriod {
  return {
    fromDate: null,
    bagsBySite: {},
    ...over,
  };
}

describe("computeReconcileAllocations", () => {
  it("consumes a site's own-paid batches first → self-use, no debt", () => {
    const pool = [
      batch({ refCode: "S1", payingSiteId: SRINI, purchaseDate: "2025-12-01" }),
      batch({ refCode: "P1", payingSiteId: PADMA, purchaseDate: "2025-12-02" }),
      batch({ refCode: "S2", payingSiteId: SRINI, purchaseDate: "2025-12-03" }),
    ];
    const periods = [
      period({ id: "p1", asOfDate: "2026-01-01", bagsBySite: { [SRINI]: 40 } }),
    ];
    const r = computeReconcileAllocations(periods, pool, []);

    // 40 bags = S1 (30) + S2 (10), both Srini-paid → all self-use
    expect(r.allocations.every((a) => a.isSelfUse)).toBe(true);
    expect(r.allocations.map((a) => [a.batchRefCode, a.quantity])).toEqual([
      ["S1", 30],
      ["S2", 10],
    ]);
    expect(r.net.amount).toBe(0);
    expect(r.shortfalls).toEqual([]);
  });

  it("borrows from sibling batch when no own stock yet → cross-site debt", () => {
    const pool = [
      batch({ refCode: "S1", payingSiteId: SRINI, purchaseDate: "2025-11-21", landedUnitCost: 280 }),
    ];
    // Padma consumes 20, has no own batch → borrows Srini's S1
    const periods = [
      period({ id: "p1", asOfDate: "2025-11-30", bagsBySite: { [PADMA]: 20 } }),
    ];
    const r = computeReconcileAllocations(periods, pool, []);

    expect(r.allocations).toHaveLength(1);
    expect(r.allocations[0]).toMatchObject({
      batchRefCode: "S1",
      usageSiteId: PADMA,
      quantity: 20,
      isSelfUse: false,
      cost: 5600,
      materialId: PPC,
      brandId: null,
    });
    // Padma owes Srini ₹5,600
    expect(r.net).toMatchObject({ fromSiteId: PADMA, toSiteId: SRINI, amount: 5600 });
  });

  it("caps a partially-delivered batch at delivered-as-of-date, not ordered qty", () => {
    const pool = [
      // 200 ordered, but only 70 delivered (verified) before the as-of date
      batch({
        refCode: "ADV",
        payingSiteId: PADMA,
        purchaseDate: "2026-05-14",
        originalQty: 200,
        deliveries: [
          { date: "2026-05-20", qty: 70 },
          { date: "2026-07-01", qty: 130 },
        ],
      }),
    ];
    const periods = [
      period({ id: "p1", asOfDate: "2026-06-01", bagsBySite: { [PADMA]: 200 } }),
    ];
    const r = computeReconcileAllocations(periods, pool, []);

    // Only 70 available as of 2026-06-01 → 130 short
    const used = r.allocations.reduce((s, a) => s + a.quantity, 0);
    expect(used).toBe(70);
    expect(r.shortfalls).toEqual([
      { periodId: "p1", usageSiteId: PADMA, requested: 200, allocated: 70, shortBy: 130 },
    ]);
  });

  it("excludes batches purchased after the as-of date", () => {
    const pool = [
      batch({ refCode: "EARLY", payingSiteId: SRINI, purchaseDate: "2025-12-01" }),
      batch({ refCode: "LATE", payingSiteId: SRINI, purchaseDate: "2026-03-01" }),
    ];
    const periods = [
      period({ id: "p1", asOfDate: "2026-01-15", bagsBySite: { [SRINI]: 30 } }),
    ];
    const r = computeReconcileAllocations(periods, pool, []);
    expect(r.allocations.map((a) => a.batchRefCode)).toEqual(["EARLY"]);
  });

  it("deletes a record only when explicitly selected for replacement, freeing its capacity", () => {
    const pool = [batch({ refCode: "S1", payingSiteId: SRINI, originalQty: 30, purchaseDate: "2025-12-01" })];
    const existing: ExistingUsage[] = [
      {
        id: "u-old",
        batchRefCode: "S1",
        usageSiteId: PADMA,
        payingSiteId: SRINI,
        usageDate: "2025-12-10",
        quantity: 20,
        totalCost: 5600,
        isSelfUse: false,
        settlementStatus: "pending",
      },
    ];
    // Declare 30 by Srini AND tick u-old for replacement → the old 20 is deleted,
    // capacity freed, Srini self-uses all 30, the old cross-site debt is gone.
    const periods = [
      period({ id: "p1", asOfDate: "2025-12-31", bagsBySite: { [SRINI]: 30 } }),
    ];
    const r = computeReconcileAllocations(periods, pool, existing, ["u-old"]);

    expect(r.deleteIds).toEqual(["u-old"]);
    expect(r.allocations.reduce((s, a) => s + a.quantity, 0)).toBe(30);
    expect(r.shortfalls).toEqual([]);
    // Old debt replaced; Srini self-used all 30 → net 0
    expect(r.net.amount).toBe(0);
  });

  it("by default ADDS to existing usage — nothing deleted, existing occupies capacity", () => {
    const pool = [batch({ refCode: "S1", payingSiteId: SRINI, originalQty: 30, purchaseDate: "2025-12-01" })];
    const existing: ExistingUsage[] = [
      {
        id: "u-old",
        batchRefCode: "S1",
        usageSiteId: PADMA,
        payingSiteId: SRINI,
        usageDate: "2025-12-10",
        quantity: 20,
        totalCost: 5600,
        isSelfUse: false,
        settlementStatus: "pending",
      },
    ];
    // Same inputs as above but NO replaceIds: the old 20 stays on the ledger and
    // occupies capacity → only 10 of the requested 30 can be added (short by 20),
    // and the kept cross-site debt still shows in the net.
    const periods = [
      period({ id: "p1", asOfDate: "2025-12-31", bagsBySite: { [SRINI]: 30 } }),
    ];
    const r = computeReconcileAllocations(periods, pool, existing);

    expect(r.deleteIds).toEqual([]);
    expect(r.periodCapacity.p1).toBe(10); // 30 delivered − 20 already recorded
    expect(r.allocations.reduce((s, a) => s + a.quantity, 0)).toBe(10);
    expect(r.shortfalls[0]).toMatchObject({ usageSiteId: SRINI, shortBy: 20 });
    // Kept baseline debt: Padma owes Srini ₹5,600
    expect(r.net).toMatchObject({ fromSiteId: PADMA, toSiteId: SRINI, amount: 5600 });
  });

  it("keeps existing pending usage by default and folds it into the net", () => {
    const pool = [
      batch({ refCode: "S1", payingSiteId: SRINI, purchaseDate: "2025-11-21", originalQty: 50 }),
      batch({ refCode: "P1", payingSiteId: PADMA, purchaseDate: "2026-02-01", originalQty: 30 }),
    ];
    const existing: ExistingUsage[] = [
      {
        id: "baseline",
        batchRefCode: "S1",
        usageSiteId: PADMA,
        payingSiteId: SRINI,
        usageDate: "2025-11-27", // outside the period below
        quantity: 20,
        totalCost: 5600,
        isSelfUse: false,
        settlementStatus: "pending",
      },
    ];
    // A later period where Padma self-uses its own P1 → no new debt
    const periods = [
      period({ id: "p1", fromDate: "2026-02-01", asOfDate: "2026-02-28", bagsBySite: { [PADMA]: 30 } }),
    ];
    const r = computeReconcileAllocations(periods, pool, existing);

    expect(r.deleteIds).toEqual([]); // baseline kept
    // Net still reflects the kept baseline: Padma owes Srini ₹5,600
    expect(r.net).toMatchObject({ fromSiteId: PADMA, toSiteId: SRINI, amount: 5600 });
  });

  it("never deletes settled records even when selected, and subtracts their qty from capacity", () => {
    const pool = [batch({ refCode: "S1", payingSiteId: SRINI, originalQty: 30, purchaseDate: "2025-12-01" })];
    const existing: ExistingUsage[] = [
      {
        id: "locked",
        batchRefCode: "S1",
        usageSiteId: PADMA,
        payingSiteId: SRINI,
        usageDate: "2025-12-10",
        quantity: 10,
        totalCost: 2800,
        isSelfUse: false,
        settlementStatus: "settled",
      },
    ];
    const periods = [
      period({ id: "p1", asOfDate: "2025-12-31", bagsBySite: { [SRINI]: 30 } }),
    ];
    // Even though "locked" is explicitly selected for replacement, it must not be deleted.
    const r = computeReconcileAllocations(periods, pool, existing, ["locked"]);

    expect(r.deleteIds).toEqual([]); // settled never deleted
    // Only 20 capacity left (30 - 10 locked) → Srini short by 10
    expect(r.allocations.reduce((s, a) => s + a.quantity, 0)).toBe(20);
    expect(r.shortfalls[0]).toMatchObject({ usageSiteId: SRINI, shortBy: 10 });
  });

  it("depletes the shared pool across multiple periods in chronological order", () => {
    const pool = [
      batch({ refCode: "S1", payingSiteId: SRINI, purchaseDate: "2025-12-01", originalQty: 30 }),
      batch({ refCode: "P1", payingSiteId: PADMA, purchaseDate: "2025-12-05", originalQty: 30 }),
    ];
    const periods = [
      // Earlier period: Padma uses 30 but only S1 exists before its asOf → borrows Srini
      period({ id: "early", asOfDate: "2025-12-03", bagsBySite: { [PADMA]: 30 } }),
      // Later period: Srini uses 30 — S1 is now exhausted, must borrow Padma's P1
      period({ id: "late", asOfDate: "2025-12-31", bagsBySite: { [SRINI]: 30 } }),
    ];
    const r = computeReconcileAllocations(periods, pool, []);

    const early = r.allocations.filter((a) => a.periodId === "early");
    const late = r.allocations.filter((a) => a.periodId === "late");
    expect(early.map((a) => a.batchRefCode)).toEqual(["S1"]); // Padma borrowed S1
    expect(late.map((a) => a.batchRefCode)).toEqual(["P1"]); // Srini borrowed P1 (S1 gone)
    // Gross flows cancel: Padma owes Srini 8400, Srini owes Padma 8400 → net 0
    expect(r.net.amount).toBe(0);
  });

  it("reports per-period available capacity, reflecting depletion by earlier periods", () => {
    const pool = [
      batch({ refCode: "S1", payingSiteId: SRINI, purchaseDate: "2025-12-01", originalQty: 30 }),
      batch({ refCode: "P1", payingSiteId: PADMA, purchaseDate: "2025-12-05", originalQty: 30 }),
    ];
    const periods = [
      // early: only S1 exists as of 12-03 → 30 available; Padma consumes all 30
      period({ id: "early", asOfDate: "2025-12-03", bagsBySite: { [PADMA]: 30 } }),
      // late: S1 now depleted, only P1's 30 remains as of 12-31
      period({ id: "late", asOfDate: "2025-12-31", bagsBySite: { [SRINI]: 30 } }),
    ];
    const r = computeReconcileAllocations(periods, pool, []);
    expect(r.periodCapacity).toEqual({ early: 30, late: 30 });
  });

  it("caps period capacity at delivered-as-of-date (advance/partial)", () => {
    const pool = [
      batch({
        refCode: "ADV",
        payingSiteId: PADMA,
        purchaseDate: "2026-05-14",
        originalQty: 200,
        deliveries: [
          { date: "2026-05-20", qty: 70 },
          { date: "2026-07-01", qty: 130 },
        ],
      }),
    ];
    const periods = [period({ id: "p1", asOfDate: "2026-06-01", bagsBySite: { [PADMA]: 10 } })];
    const r = computeReconcileAllocations(periods, pool, []);
    // Only 70 delivered as of 2026-06-01 — capacity is 70, not the ordered 200
    expect(r.periodCapacity.p1).toBe(70);
  });
});

function chunk(over: Partial<ReconcileAllocationChunk> & { batchRefCode: string }): ReconcileAllocationChunk {
  return {
    periodId: "p1",
    materialId: PPC,
    brandId: null,
    usageSiteId: SRINI,
    payingSiteId: SRINI,
    usageDate: "2025-12-31",
    quantity: 0,
    unitCost: 280,
    cost: 0,
    isSelfUse: true,
    ...over,
  };
}

describe("summarizeReconcileUsage", () => {
  it("excludes self-use from flows but counts it in bySite", () => {
    // Srini uses 40 from its own batches → no cross-site flow.
    const r = computeReconcileAllocations(
      [period({ id: "p1", asOfDate: "2026-01-01", bagsBySite: { [SRINI]: 40 } })],
      [
        batch({ refCode: "S1", payingSiteId: SRINI, purchaseDate: "2025-12-01" }),
        batch({ refCode: "S2", payingSiteId: SRINI, purchaseDate: "2025-12-03" }),
      ],
      []
    );
    const s = summarizeReconcileUsage(r.allocations, []);
    expect(s.flows).toEqual([]);
    expect(s.bySite).toEqual([{ siteId: SRINI, selfUse: 40, borrowed: 0 }]);
  });

  it("records a NEW cross-site borrow as a newQty/newAmount flow", () => {
    const r = computeReconcileAllocations(
      [period({ id: "p1", asOfDate: "2025-11-30", bagsBySite: { [PADMA]: 20 } })],
      [batch({ refCode: "S1", payingSiteId: SRINI, purchaseDate: "2025-11-21" })],
      []
    );
    const s = summarizeReconcileUsage(r.allocations, []);
    expect(s.flows).toEqual([
      { creditorSiteId: SRINI, debtorSiteId: PADMA, newQty: 20, newAmount: 5600, existingQty: 0, existingAmount: 0 },
    ]);
    expect(s.bySite).toEqual([{ siteId: PADMA, selfUse: 0, borrowed: 20 }]);
  });

  it("records a KEPT existing cross-site record as an existingQty/existingAmount flow", () => {
    const existingKept: ExistingUsage[] = [
      {
        id: "baseline",
        batchRefCode: "S1",
        usageSiteId: PADMA,
        payingSiteId: SRINI,
        usageDate: "2025-11-27",
        quantity: 20,
        totalCost: 5600,
        isSelfUse: false,
        settlementStatus: "pending",
      },
    ];
    const s = summarizeReconcileUsage([], existingKept);
    expect(s.flows).toEqual([
      { creditorSiteId: SRINI, debtorSiteId: PADMA, newQty: 0, newAmount: 0, existingQty: 20, existingAmount: 5600 },
    ]);
    expect(s.bySite).toEqual([]);
  });

  it("folds new + existing in the same direction into one flow (the 65/20 case)", () => {
    // Srini borrowed 65 new from Padma's batches; Padma had 20 already on the
    // ledger from Srini's stock — opposite directions, two rows.
    const allocations = [
      chunk({ batchRefCode: "P968A", usageSiteId: SRINI, payingSiteId: PADMA, quantity: 50, cost: 14000, isSelfUse: false }),
      chunk({ batchRefCode: "P817C", usageSiteId: SRINI, payingSiteId: PADMA, quantity: 15, cost: 4200, isSelfUse: false }),
    ];
    const existingKept: ExistingUsage[] = [
      {
        id: "9A6D-padma",
        batchRefCode: "9A6D",
        usageSiteId: PADMA,
        payingSiteId: SRINI,
        usageDate: "2025-11-27",
        quantity: 20,
        totalCost: 5600,
        isSelfUse: false,
        settlementStatus: "pending",
      },
    ];
    const s = summarizeReconcileUsage(allocations, existingKept);
    const sriniBorrow = s.flows.find((f) => f.creditorSiteId === PADMA && f.debtorSiteId === SRINI);
    const padmaBorrow = s.flows.find((f) => f.creditorSiteId === SRINI && f.debtorSiteId === PADMA);
    expect(sriniBorrow).toMatchObject({ newQty: 65, newAmount: 18200, existingQty: 0, existingAmount: 0 });
    expect(padmaBorrow).toMatchObject({ newQty: 0, newAmount: 0, existingQty: 20, existingAmount: 5600 });
  });

  it("collapses new + existing of the SAME direction into one combined flow", () => {
    const allocations = [
      chunk({ batchRefCode: "P1", usageSiteId: SRINI, payingSiteId: PADMA, quantity: 65, cost: 18200, isSelfUse: false }),
    ];
    const existingKept: ExistingUsage[] = [
      {
        id: "old-same-dir",
        batchRefCode: "P0",
        usageSiteId: SRINI,
        payingSiteId: PADMA,
        usageDate: "2025-10-01",
        quantity: 10,
        totalCost: 2800,
        isSelfUse: false,
        settlementStatus: "pending",
      },
    ];
    const s = summarizeReconcileUsage(allocations, existingKept);
    expect(s.flows).toEqual([
      { creditorSiteId: PADMA, debtorSiteId: SRINI, newQty: 65, newAmount: 18200, existingQty: 10, existingAmount: 2800 },
    ]);
  });

  it("ignores existing self-use and same-site records", () => {
    const existingKept: ExistingUsage[] = [
      {
        id: "selfuse",
        batchRefCode: "S1",
        usageSiteId: SRINI,
        payingSiteId: SRINI,
        usageDate: "2025-11-27",
        quantity: 30,
        totalCost: 8400,
        isSelfUse: true,
        settlementStatus: "self_use",
      },
    ];
    const s = summarizeReconcileUsage([], existingKept);
    expect(s.flows).toEqual([]);
  });

  it("new-flow amounts reconcile with computeReconcileAllocations grossFlows", () => {
    // Invariant guard: the summary's NEW legs must match the allocator's gross
    // flows for the same inputs (pins the creditor=payer/debtor=user convention).
    const pool = [batch({ refCode: "S1", payingSiteId: SRINI, purchaseDate: "2025-11-21" })];
    const periods = [period({ id: "p1", asOfDate: "2025-11-30", bagsBySite: { [PADMA]: 20 } })];
    const r = computeReconcileAllocations(periods, pool, []);
    const s = summarizeReconcileUsage(r.allocations, []);
    for (const gf of r.grossFlows) {
      const f = s.flows.find((x) => x.creditorSiteId === gf.creditorSiteId && x.debtorSiteId === gf.debtorSiteId);
      expect(f).toBeDefined();
      expect(f!.newAmount).toBe(gf.amount);
      expect(f!.newQty).toBe(gf.qty);
    }
  });
});
