import { describe, it, expect } from "vitest";
import {
  summarizeLegacyExpenseBatch,
  LegacyExpenseSummaryContext,
} from "./legacyExpenseSummary";

const CTX: LegacyExpenseSummaryContext = {
  categories: [
    { id: "cat-mat", name: "Material Settlement" },
    { id: "cat-labor", name: "Daily Labor Settlement" },
  ],
  subcontracts: [
    { id: "sub-gf", title: "Ground Floor Construction", total_value: 100000 },
    { id: "sub-rs", title: "Roof Slab", total_value: null },
  ],
  cutoffDate: "2025-11-09",
};

describe("summarizeLegacyExpenseBatch", () => {
  it("returns zeroed summary for an empty batch", () => {
    const s = summarizeLegacyExpenseBatch([], CTX);
    expect(s.totalSpent).toBe(0);
    expect(s.count).toBe(0);
    expect(s.byCategory).toEqual([]);
    expect(s.bySubcontract).toEqual([]);
    expect(s.byPayerSource).toEqual([]);
    expect(s.dateRange).toEqual({ min: null, max: null });
    expect(s.rowsOnOrAfterCutoff).toBe(0);
  });

  it("sums total spent and counts rows (numeric and string amounts)", () => {
    const s = summarizeLegacyExpenseBatch(
      [
        { amount: 1000, date: "2024-01-01" },
        { amount: "2,500", date: "2024-01-02" },
        { amount: "bad", date: "2024-01-03" },
      ],
      CTX
    );
    expect(s.totalSpent).toBe(3500); // bad -> 0
    expect(s.count).toBe(3);
  });

  it("groups by category, sorts desc, and buckets unknown/null as Uncategorized", () => {
    const s = summarizeLegacyExpenseBatch(
      [
        { amount: 100, category_id: "cat-labor" },
        { amount: 500, category_id: "cat-mat" },
        { amount: 50, category_id: null },
        { amount: 25, category_id: "ghost-id" },
      ],
      CTX
    );
    expect(s.byCategory[0]).toMatchObject({ categoryId: "cat-mat", name: "Material Settlement", total: 500 });
    const uncategorized = s.byCategory.find((c) => c.name === "Uncategorized");
    expect(uncategorized?.total).toBe(75); // null (50) + ghost-id (25) both -> Uncategorized name, but distinct keys
  });

  it("computes per-subcontract spend, matched flag, value and indicative balance", () => {
    const s = summarizeLegacyExpenseBatch(
      [
        { amount: 30000, subcontract_id: "sub-gf" },
        { amount: 10000, subcontract_id: "sub-gf" },
        { amount: 5000, subcontract_id: "sub-rs" },
        { amount: 2000, subcontract_id: null },
      ],
      CTX
    );
    const gf = s.bySubcontract.find((x) => x.subcontractId === "sub-gf");
    expect(gf).toMatchObject({
      matched: true,
      title: "Ground Floor Construction",
      value: 100000,
      importedSpend: 40000,
      balance: 60000,
    });
    const rs = s.bySubcontract.find((x) => x.subcontractId === "sub-rs");
    expect(rs).toMatchObject({ matched: true, value: null, importedSpend: 5000, balance: null });
    const none = s.bySubcontract.find((x) => x.subcontractId === null);
    expect(none).toMatchObject({ matched: false, title: "(No subcontract)", importedSpend: 2000, balance: null });
    // sorted desc by importedSpend
    expect(s.bySubcontract[0].subcontractId).toBe("sub-gf");
  });

  it("groups by payer source with null -> unspecified", () => {
    const s = summarizeLegacyExpenseBatch(
      [
        { amount: 100, payer_source: "own_money" },
        { amount: 300, payer_source: "client_money" },
        { amount: 50, payer_source: null },
      ],
      CTX
    );
    expect(s.byPayerSource[0]).toMatchObject({ payerSource: "client_money", total: 300 });
    expect(s.byPayerSource.find((p) => p.payerSource === "unspecified")?.total).toBe(50);
  });

  it("tracks date range and counts rows on/after the cutoff", () => {
    const s = summarizeLegacyExpenseBatch(
      [
        { amount: 1, date: "2023-06-01" },
        { amount: 1, date: "2025-11-09" }, // == cutoff -> on/after
        { amount: 1, date: "2025-12-01" }, // after cutoff
        { amount: 1, date: "2024-02-15" },
      ],
      CTX
    );
    expect(s.dateRange).toEqual({ min: "2023-06-01", max: "2025-12-01" });
    expect(s.rowsOnOrAfterCutoff).toBe(2);
  });

  it("never flags cutoff rows when the site has no cutoff date", () => {
    const s = summarizeLegacyExpenseBatch(
      [{ amount: 1, date: "2025-12-01" }],
      { ...CTX, cutoffDate: null }
    );
    expect(s.rowsOnOrAfterCutoff).toBe(0);
  });
});
