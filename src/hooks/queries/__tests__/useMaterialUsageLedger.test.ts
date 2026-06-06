import { describe, it, expect } from "vitest";
import { groupByMaterial, groupBySection, type LedgerRow } from "../useMaterialUsageLedger";

const rows: LedgerRow[] = [
  {
    id: "1", site_id: "s1", site_group_id: "g1",
    material_id: "m1", brand_id: null, section_id: "sec1",
    quantity: 100, unit: "bag", unit_cost: 200, total_cost: 20000,
    usage_date: "2026-01-01", work_description: "Foundation",
    source: "batch" as const,
    material_name: "Cement", section_name: "Footing",
    batch_ref_code: "MAT-260101-TEST", created_by: "00000000-0000-0000-0000-000000000001",
    created_at: "2026-01-01T00:00:00Z", is_self_use: false,
    settlement_status: "pending", is_verified: null,
    parent_material_id: null, parent_material_name: null,
    group_default_grade_id: null, group_default_grade_name: null, brand_name: null,
    material: { id: "m1", name: "Cement" },
    section: { id: "sec1", name: "Footing" },
  },
  {
    id: "2", site_id: "s1", site_group_id: "g1",
    material_id: "m1", brand_id: null, section_id: "sec2",
    quantity: 50, unit: "bag", unit_cost: 200, total_cost: 10000,
    usage_date: "2026-02-01", work_description: "Wall",
    source: "own" as const,
    material_name: "Cement", section_name: "Structure",
    batch_ref_code: null, created_by: "00000000-0000-0000-0000-000000000002",
    created_at: "2026-01-01T00:00:00Z", is_self_use: null,
    settlement_status: null, is_verified: false,
    parent_material_id: null, parent_material_name: null,
    group_default_grade_id: null, group_default_grade_name: null, brand_name: null,
    material: { id: "m1", name: "Cement" },
    section: { id: "sec2", name: "Structure" },
  },
  {
    id: "3", site_id: "s1", site_group_id: "g1",
    material_id: "m2", brand_id: null, section_id: null,
    quantity: 200, unit: "cft", unit_cost: 50, total_cost: 10000,
    usage_date: "2026-01-15", work_description: null,
    source: "batch" as const,
    material_name: "M-Sand", section_name: null,
    batch_ref_code: "MAT-260101-TEST", created_by: "00000000-0000-0000-0000-000000000003",
    created_at: "2026-01-01T00:00:00Z", is_self_use: false,
    settlement_status: "pending", is_verified: null,
    parent_material_id: null, parent_material_name: null,
    group_default_grade_id: null, group_default_grade_name: null, brand_name: null,
    material: { id: "m2", name: "M-Sand" },
    section: null,
  },
];

// Grade scenario: a "43 Grade" variant row (parent_material_id → PPC) PLUS a
// bare-parent PPC row. PPC's default grade variant is "43 Grade" (v43), so both
// rows attribute to the same grade node — with their own brands preserved.
const gradeRows: LedgerRow[] = [
  {
    id: "v1", site_id: "s1", site_group_id: "g1",
    material_id: "v43", brand_id: "b1", section_id: "sec1",
    quantity: 43.5, unit: "bag", unit_cost: 305, total_cost: 13267.5,
    usage_date: "2026-03-01", work_description: "Slab",
    source: "batch" as const,
    material_name: "43 Grade", section_name: "Footing",
    batch_ref_code: "MAT-260301-PPC", created_by: "00000000-0000-0000-0000-000000000004",
    created_at: "2026-03-01T00:00:00Z", is_self_use: true,
    settlement_status: "self_use", is_verified: null,
    parent_material_id: "p_ppc", parent_material_name: "PPC Cement (50kg bag)",
    group_default_grade_id: "v43", group_default_grade_name: "43 Grade", brand_name: "Chettinad",
    material: { id: "v43", name: "43 Grade" },
    section: { id: "sec1", name: "Footing" },
  },
  {
    id: "v2", site_id: "s1", site_group_id: "g1",
    material_id: "p_ppc", brand_id: "b2", section_id: "sec2",
    quantity: 220, unit: "bag", unit_cost: 290.9, total_cost: 64000,
    usage_date: "2026-03-05", work_description: "Columns",
    source: "batch" as const,
    material_name: "PPC Cement (50kg bag)", section_name: "Structure",
    batch_ref_code: "MAT-260305-PPC", created_by: "00000000-0000-0000-0000-000000000005",
    created_at: "2026-03-05T00:00:00Z", is_self_use: true,
    settlement_status: "self_use", is_verified: null,
    parent_material_id: null, parent_material_name: null,
    group_default_grade_id: "v43", group_default_grade_name: "43 Grade", brand_name: "TNPL",
    material: { id: "p_ppc", name: "PPC Cement (50kg bag)" },
    section: { id: "sec2", name: "Structure" },
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

  it("a material with no parent and no default grade → 'Grade not recorded' / 'Brand not set'", () => {
    const result = groupByMaterial(rows);
    const cement = result.find((r) => r.material_id === "m1")!;
    expect(cement.grade_breakdown).toHaveLength(1);
    const grade = cement.grade_breakdown[0];
    expect(grade.grade_name).toBe("Grade not recorded");
    expect(grade.total_qty).toBe(150);
    expect(grade.brands).toHaveLength(1);
    expect(grade.brands[0].brand_id).toBeNull();
    expect(grade.brands[0].brand_name).toBe("Brand not set");
    expect(grade.brands[0].total_qty).toBe(150);
  });
});

describe("groupByMaterial — grade → brand tree", () => {
  it("rolls variant + bare-parent into one parent group", () => {
    const result = groupByMaterial(gradeRows);
    expect(result).toHaveLength(1);
    const ppc = result[0];
    expect(ppc.material_id).toBe("p_ppc");
    expect(ppc.material_name).toBe("PPC Cement (50kg bag)");
    expect(ppc.total_qty).toBe(263.5);
  });

  it("attributes both the variant row and the bare-parent (via default grade) to ONE '43 Grade' node", () => {
    const result = groupByMaterial(gradeRows);
    const ppc = result[0];
    // Single grade node — the variant row (material v43) and the bare-parent row
    // (default grade v43) collapse together.
    expect(ppc.grade_breakdown).toHaveLength(1);
    const grade = ppc.grade_breakdown[0];
    expect(grade.grade_id).toBe("v43");
    expect(grade.grade_name).toBe("43 Grade");
    expect(grade.total_qty).toBe(263.5);
  });

  it("splits the grade into brands (preserved, cost desc)", () => {
    const result = groupByMaterial(gradeRows);
    const grade = result[0].grade_breakdown[0];
    expect(grade.brands).toHaveLength(2);
    // Sorted by cost desc → TNPL (64000) leads Chettinad (13267.5).
    const [first, second] = grade.brands;
    expect(first.brand_id).toBe("b2");
    expect(first.brand_name).toBe("TNPL");
    expect(first.total_qty).toBe(220);
    expect(second.brand_id).toBe("b1");
    expect(second.brand_name).toBe("Chettinad");
    expect(second.total_qty).toBe(43.5);
  });

  it("does not roll unrelated materials together", () => {
    const result = groupByMaterial([...rows, ...gradeRows]);
    // m1, m2, and the PPC parent group = 3 groups
    expect(result).toHaveLength(3);
    expect(result.map((g) => g.material_id).sort()).toEqual(["m1", "m2", "p_ppc"]);
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

  it("rolls variants up to the parent in material_breakdown", () => {
    const result = groupBySection(gradeRows);
    const footing = result.find((r) => r.section_id === "sec1")!;
    // The "43 Grade" variant shows as its parent material in the section split.
    expect(footing.material_breakdown[0].material_id).toBe("p_ppc");
    expect(footing.material_breakdown[0].material_name).toBe("PPC Cement (50kg bag)");
  });
});

describe("empty input", () => {
  it("groupByMaterial returns [] for empty input", () => {
    expect(groupByMaterial([])).toEqual([]);
  });
  it("groupBySection returns [] for empty input", () => {
    expect(groupBySection([])).toEqual([]);
  });
});
