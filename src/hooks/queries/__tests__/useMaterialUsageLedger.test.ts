import { describe, it, expect } from "vitest";
import { groupByMaterial, groupBySection } from "../useMaterialUsageLedger";

const rows = [
  {
    id: "1", site_id: "s1", site_group_id: "g1",
    material_id: "m1", brand_id: null, section_id: "sec1",
    quantity: 100, unit: "bag", unit_cost: 200, total_cost: 20000,
    usage_date: "2026-01-01", work_description: "Foundation",
    source: "batch" as const,
    material: { id: "m1", name: "Cement" },
    section: { id: "sec1", name: "Footing" },
  },
  {
    id: "2", site_id: "s1", site_group_id: "g1",
    material_id: "m1", brand_id: null, section_id: "sec2",
    quantity: 50, unit: "bag", unit_cost: 200, total_cost: 10000,
    usage_date: "2026-02-01", work_description: "Wall",
    source: "own" as const,
    material: { id: "m1", name: "Cement" },
    section: { id: "sec2", name: "Structure" },
  },
  {
    id: "3", site_id: "s1", site_group_id: "g1",
    material_id: "m2", brand_id: null, section_id: null,
    quantity: 200, unit: "cft", unit_cost: 50, total_cost: 10000,
    usage_date: "2026-01-15", work_description: null,
    source: "batch" as const,
    material: { id: "m2", name: "M-Sand" },
    section: null,
  },
];

describe("groupByMaterial", () => {
  it("aggregates rows by material_id", () => {
    const result = groupByMaterial(rows);
    expect(result).toHaveLength(2);
    const cement = result.find((r) => r.material_id === "m1");
    expect(cement).toBeDefined();
    expect(cement!.total_qty).toBe(150);
    expect(cement!.total_cost).toBe(30000);
    expect(cement!.unit).toBe("bag");
  });

  it("computes weighted avg_unit_cost", () => {
    const result = groupByMaterial(rows);
    const cement = result.find((r) => r.material_id === "m1")!;
    // 30000 / 150 = 200
    expect(cement.avg_unit_cost).toBe(200);
  });

  it("counts untagged entries", () => {
    const result = groupByMaterial(rows);
    const sand = result.find((r) => r.material_id === "m2")!;
    expect(sand.untagged_count).toBe(1);
    const cement = result.find((r) => r.material_id === "m1")!;
    expect(cement.untagged_count).toBe(0);
  });

  it("builds section_breakdown per material", () => {
    const result = groupByMaterial(rows);
    const cement = result.find((r) => r.material_id === "m1")!;
    expect(cement.section_breakdown).toHaveLength(2);
    const footing = cement.section_breakdown.find((s) => s.section_id === "sec1")!;
    expect(footing.total_qty).toBe(100);
  });
});

describe("groupBySection", () => {
  it("groups rows by section_id, null → 'untagged'", () => {
    const result = groupBySection(rows);
    expect(result.find((r) => r.section_id === "sec1")).toBeDefined();
    expect(result.find((r) => r.section_id === null)).toBeDefined();
  });

  it("totals cost per section", () => {
    const result = groupBySection(rows);
    const footing = result.find((r) => r.section_id === "sec1")!;
    expect(footing.total_cost).toBe(20000);
  });

  it("builds material_breakdown per section", () => {
    const result = groupBySection(rows);
    const untagged = result.find((r) => r.section_id === null)!;
    expect(untagged.material_breakdown).toHaveLength(1);
    expect(untagged.material_breakdown[0].material_id).toBe("m2");
  });
});
