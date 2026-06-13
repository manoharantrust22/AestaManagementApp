import { describe, it, expect } from "vitest";
import {
  computeReconcileAllocations,
  type BatchPoolRow,
  type ExistingUsage,
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

  it("marks pending usage inside a period range for deletion and frees its capacity", () => {
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
    // Re-declare the same range: 30 bags by Srini. The old 20 is replaced, capacity freed.
    const periods = [
      period({ id: "p1", fromDate: "2025-12-01", asOfDate: "2025-12-31", bagsBySite: { [SRINI]: 30 } }),
    ];
    const r = computeReconcileAllocations(periods, pool, existing);

    expect(r.deleteIds).toEqual(["u-old"]);
    expect(r.allocations.reduce((s, a) => s + a.quantity, 0)).toBe(30);
    expect(r.shortfalls).toEqual([]);
    // Old debt replaced; Srini self-used all 30 → net 0
    expect(r.net.amount).toBe(0);
  });

  it("keeps (does not delete) pending usage outside the range and folds it into the net", () => {
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

  it("never deletes settled records and subtracts their qty from capacity", () => {
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
      period({ id: "p1", fromDate: "2025-12-01", asOfDate: "2025-12-31", bagsBySite: { [SRINI]: 30 } }),
    ];
    const r = computeReconcileAllocations(periods, pool, existing);

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
