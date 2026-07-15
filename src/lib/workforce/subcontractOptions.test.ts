import { describe, it, expect } from "vitest";
import {
  buildSubcontractOptions,
  soleTopLevelSubcontractId,
} from "./subcontractOptions";

type Row = {
  id: string;
  parent_subcontract_id?: string | null;
  title: string;
  laborer_id?: string | null;
};

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

describe("soleTopLevelSubcontractId", () => {
  it("returns the parent id when the list is one parent with floor children (the auto-pick regression)", () => {
    const rows: Row[] = [
      { id: "P", parent_subcontract_id: null, title: "Jithin Civil contract" },
      { id: "C1", parent_subcontract_id: "P", title: "Ground Floor" },
      { id: "C2", parent_subcontract_id: "P", title: "1st Floor" },
    ];
    expect(soleTopLevelSubcontractId(rows)).toBe("P");
  });

  it("returns the id of a single standalone contract", () => {
    const rows: Row[] = [{ id: "S", parent_subcontract_id: null, title: "Only one" }];
    expect(soleTopLevelSubcontractId(rows)).toBe("S");
  });

  it("returns null when a parent cluster coexists with a standalone contract", () => {
    const rows: Row[] = [
      { id: "P", parent_subcontract_id: null, title: "Civil parent" },
      { id: "C1", parent_subcontract_id: "P", title: "Ground Floor" },
      { id: "S", parent_subcontract_id: null, title: "Electrical" },
    ];
    expect(soleTopLevelSubcontractId(rows)).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(soleTopLevelSubcontractId([])).toBeNull();
  });

  it("does NOT collapse two top-level contracts that share the same mestri", () => {
    // The pick decides which contract's ledger receives the money — a shared
    // mestri does not make the choice unambiguous.
    const rows: Row[] = [
      { id: "A", parent_subcontract_id: null, title: "Contract A", laborer_id: "M1" },
      { id: "B", parent_subcontract_id: null, title: "Contract B", laborer_id: "M1" },
    ];
    expect(soleTopLevelSubcontractId(rows)).toBeNull();
  });

  it("counts an orphaned child (parent absent) as its own top-level choice", () => {
    const rows: Row[] = [
      { id: "C1", parent_subcontract_id: "GONE", title: "Ground Floor" },
      { id: "S", parent_subcontract_id: null, title: "Standalone" },
    ];
    expect(soleTopLevelSubcontractId(rows)).toBeNull();
  });

  it("returns a lone orphaned child when it is the only row", () => {
    const rows: Row[] = [
      { id: "C1", parent_subcontract_id: "GONE", title: "Ground Floor" },
    ];
    expect(soleTopLevelSubcontractId(rows)).toBe("C1");
  });
});
