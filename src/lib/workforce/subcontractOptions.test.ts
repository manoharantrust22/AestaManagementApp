import { describe, it, expect } from "vitest";
import { buildSubcontractOptions } from "./subcontractOptions";

type Row = { id: string; parent_subcontract_id?: string | null; title: string };

describe("buildSubcontractOptions", () => {
  it("orders each parent immediately followed by its children, with depth + isParent flags", () => {
    const rows: Row[] = [
      { id: "P", parent_subcontract_id: null, title: "Jithin Civil contract" },
      { id: "C1", parent_subcontract_id: "P", title: "Ground Floor" },
      { id: "C2", parent_subcontract_id: "P", title: "1st Floor" },
      { id: "S", parent_subcontract_id: null, title: "Electrical (standalone)" },
    ];
    const out = buildSubcontractOptions(rows);
    expect(out.map((r) => r.item.id)).toEqual(["P", "C1", "C2", "S"]);
    expect(out.map((r) => r.depth)).toEqual([0, 1, 1, 0]);
    expect(out.map((r) => r.isParent)).toEqual([true, false, false, false]);
  });

  it("shows an orphaned child (parent absent from the list) as a standalone top-level row", () => {
    const rows: Row[] = [
      { id: "C1", parent_subcontract_id: "GONE", title: "Ground Floor" },
      { id: "S", parent_subcontract_id: null, title: "Standalone" },
    ];
    const out = buildSubcontractOptions(rows);
    expect(out.map((r) => r.item.id)).toEqual(["C1", "S"]);
    expect(out.every((r) => r.depth === 0)).toBe(true);
    expect(out.every((r) => r.isParent === false)).toBe(true);
  });

  it("treats undefined parent_subcontract_id like null (top-level)", () => {
    const rows: Row[] = [{ id: "A", title: "No parent field" }];
    const out = buildSubcontractOptions(rows);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ depth: 0, isParent: false });
  });
});
