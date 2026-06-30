import { describe, it, expect } from "vitest";
import { computeContractTeaSplit, type TeaSplitRow } from "../contractTeaSplit";

const row = (over: Partial<TeaSplitRow> & { key: string; siteId: string; manDays: number }): TeaSplitRow => ({
  included: true,
  ...over,
});

describe("computeContractTeaSplit", () => {
  it("splits proportionally by man-days and conserves the total", () => {
    const out = computeContractTeaSplit(100, [
      row({ key: "a", siteId: "s1", manDays: 3 }),
      row({ key: "b", siteId: "s1", manDays: 1 }),
    ]);
    expect(out.rows.find((r) => r.key === "a")!.amount).toBe(75);
    expect(out.rows.find((r) => r.key === "b")!.amount).toBe(25);
    expect(out.total).toBe(100);
    expect(out.bySite["s1"]).toBe(100);
  });

  it("excludes unchecked rows from the denominator and gives them 0", () => {
    const out = computeContractTeaSplit(90, [
      row({ key: "a", siteId: "s1", manDays: 2 }),
      row({ key: "b", siteId: "s1", manDays: 1, included: false }),
    ]);
    expect(out.rows.find((r) => r.key === "a")!.amount).toBe(90);
    expect(out.rows.find((r) => r.key === "b")!.amount).toBe(0);
    expect(out.total).toBe(90);
  });

  it("fixes an overridden row and shares the remainder across auto rows", () => {
    const out = computeContractTeaSplit(100, [
      row({ key: "a", siteId: "s1", manDays: 1, overrideAmount: 40 }),
      row({ key: "b", siteId: "s1", manDays: 3 }),
      row({ key: "c", siteId: "s1", manDays: 1 }),
    ]);
    const a = out.rows.find((r) => r.key === "a")!;
    expect(a.amount).toBe(40);
    expect(a.isOverride).toBe(true);
    // remainder 60 split 3:1 across b,c
    expect(out.rows.find((r) => r.key === "b")!.amount).toBe(45);
    expect(out.rows.find((r) => r.key === "c")!.amount).toBe(15);
    expect(out.total).toBe(100);
  });

  it("dedicates each crew's share to its owning site across a group", () => {
    const out = computeContractTeaSplit(100, [
      row({ key: "m1", siteId: "s1", manDays: 2 }), // mesthri site 1
      row({ key: "c1", siteId: "s1", manDays: 2 }), // contract site 1
      row({ key: "m2", siteId: "s2", manDays: 1 }), // mesthri site 2
    ]);
    // weights 2:2:1 of 100 → 40,40,20
    expect(out.bySite["s1"]).toBe(80);
    expect(out.bySite["s2"]).toBe(20);
    expect(out.total).toBe(100);
  });

  it("splits evenly when no man-days are recorded", () => {
    const out = computeContractTeaSplit(100, [
      row({ key: "a", siteId: "s1", manDays: 0 }),
      row({ key: "b", siteId: "s2", manDays: 0 }),
    ]);
    expect(out.rows.find((r) => r.key === "a")!.amount).toBe(50);
    expect(out.rows.find((r) => r.key === "b")!.amount).toBe(50);
  });

  it("returns all zeros for a zero total", () => {
    const out = computeContractTeaSplit(0, [row({ key: "a", siteId: "s1", manDays: 3 })]);
    expect(out.total).toBe(0);
    expect(out.rows[0].amount).toBe(0);
  });
});
