import { describe, it, expect } from "vitest";
import {
  buildContractTeaModel,
  type ContractTeaModelRow,
} from "../buildContractTeaModel";

const sites = [
  { id: "s1", name: "Padmavathy" },
  { id: "s2", name: "Srinivasan" },
];

const row = (
  over: Partial<ContractTeaModelRow> & { key: string; siteId: string; manDays: number }
): ContractTeaModelRow => ({
  presenceKind: "package",
  refId: over.key,
  tradeCategoryId: null,
  ...over,
});

describe("buildContractTeaModel", () => {
  it("returns null when there are no rows", () => {
    expect(buildContractTeaModel(100, [], sites)).toBeNull();
  });

  it("builds conserving per-site allocations split by man-days", () => {
    const model = buildContractTeaModel(
      160,
      [
        row({ key: "mesthri:s1", siteId: "s1", presenceKind: "mesthri", refId: null, manDays: 0 }),
        row({ key: "package:p1", siteId: "s1", manDays: 4 }),
        row({ key: "package:p2", siteId: "s2", manDays: 4 }),
      ],
      sites
    )!;
    // 8 man-days, ₹160 → ₹80 each site.
    const sum = model.allocations.reduce((s, a) => s + a.allocated_amount, 0);
    expect(sum).toBe(160);
    expect(model.allocations.find((a) => a.site_id === "s1")!.allocated_amount).toBe(80);
    expect(model.allocations.find((a) => a.site_id === "s2")!.allocated_amount).toBe(80);
    expect(model.totalDayUnits).toBe(8);
    // The zero-man-day mesthri row still records a selection (intent), but the
    // site allocation comes from the contract row.
    expect(model.selections).toHaveLength(3);
  });

  it("drops an excluded row from the split and flags it in selections", () => {
    const model = buildContractTeaModel(
      90,
      [
        row({ key: "package:a", siteId: "s1", manDays: 2 }),
        row({ key: "package:b", siteId: "s2", manDays: 1 }),
      ],
      sites,
      { included: { "package:b": false } }
    )!;
    expect(model.allocations.find((a) => a.site_id === "s1")!.allocated_amount).toBe(90);
    // s2 excluded → no positive allocation.
    expect(model.allocations.find((a) => a.site_id === "s2")).toBeUndefined();
    const selB = model.selections.find((s) => s.ref_id === "package:b")!;
    expect(selB.is_included).toBe(false);
    expect(selB.allocated_amount).toBe(0);
    expect(model.totalDayUnits).toBe(2);
  });

  it("marks an overridden row and re-splits the remainder", () => {
    const model = buildContractTeaModel(
      100,
      [
        row({ key: "package:a", siteId: "s1", manDays: 1 }),
        row({ key: "package:b", siteId: "s2", manDays: 3 }),
      ],
      sites,
      { overrides: { "package:a": 40 } }
    )!;
    const selA = model.selections.find((s) => s.ref_id === "package:a")!;
    expect(selA.is_amount_override).toBe(true);
    expect(selA.allocated_amount).toBe(40);
    expect(model.allocations.find((a) => a.site_id === "s2")!.allocated_amount).toBe(60);
    const total = model.allocations.reduce((s, a) => s + a.allocated_amount, 0);
    expect(total).toBe(100);
  });
});
