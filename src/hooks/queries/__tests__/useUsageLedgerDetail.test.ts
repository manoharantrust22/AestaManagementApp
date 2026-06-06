import { describe, it, expect } from "vitest";
import { buildLedgerDetailEntries } from "../useUsageLedgerDetail";
import type { LedgerRow } from "../useMaterialUsageLedger";

// ─── Minimal fixture factory ──────────────────────────────────────────────────
function makeRow(overrides: Partial<LedgerRow> & { id: string }): LedgerRow {
  return {
    site_id: "site-A",
    site_group_id: null,
    material_id: "mat-1",
    brand_id: null,
    section_id: null,
    quantity: 10,
    unit: "bag",
    unit_cost: 200,
    total_cost: 2000,
    usage_date: "2026-01-01",
    work_description: "Foundation work",
    source: "batch",
    material_name: "Cement",
    section_name: null,
    batch_ref_code: "REF-001",
    created_by: "auth-uuid-1",
    created_at: "2026-01-01T08:00:00Z",
    is_self_use: false,
    settlement_status: "pending",
    is_verified: null,
    parent_material_id: null,
    parent_material_name: null,
    material: { id: "mat-1", name: "Cement" },
    section: null,
    ...overrides,
  };
}

// ─── Map helpers ──────────────────────────────────────────────────────────────
const usersByAuthId = new Map<string, string>([
  ["auth-uuid-1", "Alice"],
  ["auth-uuid-2", "Bob"],
]);

const usersById = new Map<string, string>([
  ["pub-user-1", "Charlie"],
  ["pub-user-2", "Diana"],
]);

const sitesById = new Map<string, string>([
  ["site-A", "North Site"],
  ["site-B", "South Site"],
]);

// ─── Test rows ────────────────────────────────────────────────────────────────
const batchRow = makeRow({
  id: "r1",
  source: "batch",
  created_by: "auth-uuid-1",
  usage_date: "2026-03-01",
  site_id: "site-A",
  material_id: "mat-1",
});

const ownRow = makeRow({
  id: "r2",
  source: "own",
  created_by: "pub-user-1",
  usage_date: "2026-02-01",
  site_id: "site-B",
  material_id: "mat-1",
});

const otherMaterialRow = makeRow({
  id: "r3",
  material_id: "mat-99",
  source: "batch",
  created_by: "auth-uuid-2",
  usage_date: "2026-04-01",
});

const unknownCreatorBatchRow = makeRow({
  id: "r4",
  source: "batch",
  created_by: "auth-unknown",
  usage_date: "2026-01-15",
  material_id: "mat-1",
});

const nullCreatorRow = makeRow({
  id: "r5",
  source: "own",
  created_by: null,
  usage_date: "2026-01-10",
  material_id: "mat-1",
});

const olderRow = makeRow({
  id: "r6",
  source: "batch",
  created_by: "auth-uuid-1",
  usage_date: "2026-01-05",
  material_id: "mat-1",
});

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("buildLedgerDetailEntries", () => {
  it("1. filters to the given materialId — rows of other materials excluded", () => {
    const result = buildLedgerDetailEntries(
      [batchRow, ownRow, otherMaterialRow],
      "mat-1",
      usersByAuthId,
      usersById,
      sitesById,
    );
    expect(result.map((r) => r.id)).not.toContain("r3");
    expect(result.every((r) => r.id !== "r3")).toBe(true);
  });

  it("2. batch row resolves recorded_by_name via usersByAuthId", () => {
    const [entry] = buildLedgerDetailEntries(
      [batchRow],
      "mat-1",
      usersByAuthId,
      usersById,
      sitesById,
    );
    expect(entry.recorded_by_name).toBe("Alice");
  });

  it("3. own row resolves recorded_by_name via usersById", () => {
    const [entry] = buildLedgerDetailEntries(
      [ownRow],
      "mat-1",
      usersByAuthId,
      usersById,
      sitesById,
    );
    expect(entry.recorded_by_name).toBe("Charlie");
  });

  it("4a. unknown created_by (not in map) → '—'", () => {
    const [entry] = buildLedgerDetailEntries(
      [unknownCreatorBatchRow],
      "mat-1",
      usersByAuthId,
      usersById,
      sitesById,
    );
    expect(entry.recorded_by_name).toBe("—");
  });

  it("4b. null created_by → '—'", () => {
    const [entry] = buildLedgerDetailEntries(
      [nullCreatorRow],
      "mat-1",
      usersByAuthId,
      usersById,
      sitesById,
    );
    expect(entry.recorded_by_name).toBe("—");
  });

  it("5a. consuming_site_name resolves via sitesById", () => {
    const [entry] = buildLedgerDetailEntries(
      [batchRow],
      "mat-1",
      usersByAuthId,
      usersById,
      sitesById,
    );
    expect(entry.consuming_site_name).toBe("North Site");
  });

  it("5b. consuming_site_name falls back to site_id when missing from sitesById", () => {
    const rowWithUnknownSite = makeRow({
      id: "r-unknown-site",
      site_id: "site-UNKNOWN",
      material_id: "mat-1",
    });
    const [entry] = buildLedgerDetailEntries(
      [rowWithUnknownSite],
      "mat-1",
      usersByAuthId,
      usersById,
      sitesById,
    );
    expect(entry.consuming_site_name).toBe("site-UNKNOWN");
  });

  it("6. sorted by usage_date descending — most recent first", () => {
    const rows = [olderRow, batchRow, ownRow]; // dates: 2026-01-05, 2026-03-01, 2026-02-01
    const result = buildLedgerDetailEntries(
      rows,
      "mat-1",
      usersByAuthId,
      usersById,
      sitesById,
    );
    const dates = result.map((r) => r.usage_date);
    // Expect descending: 2026-03-01, 2026-02-01, 2026-01-05
    expect(dates).toEqual([...dates].sort((a, b) => b.localeCompare(a)));
  });

  it("quantity is coerced to number", () => {
    const rowWithStringQty = makeRow({
      id: "r-str-qty",
      // Simulate numeric string from DB (override type for test)
      quantity: "42.5" as unknown as number,
      material_id: "mat-1",
    });
    const [entry] = buildLedgerDetailEntries(
      [rowWithStringQty],
      "mat-1",
      usersByAuthId,
      usersById,
      sitesById,
    );
    expect(entry.quantity).toBe(42.5);
    expect(typeof entry.quantity).toBe("number");
  });

  it("consuming_site_id equals row.site_id", () => {
    const [entry] = buildLedgerDetailEntries(
      [batchRow],
      "mat-1",
      usersByAuthId,
      usersById,
      sitesById,
    );
    expect(entry.consuming_site_id).toBe(batchRow.site_id);
  });

  it("returns empty array for no matching rows", () => {
    const result = buildLedgerDetailEntries(
      [otherMaterialRow],
      "mat-1",
      usersByAuthId,
      usersById,
      sitesById,
    );
    expect(result).toHaveLength(0);
  });

  it("carries each entry's material_name (may be a variant)", () => {
    const [entry] = buildLedgerDetailEntries(
      [batchRow],
      "mat-1",
      usersByAuthId,
      usersById,
      sitesById,
    );
    expect(entry.material_name).toBe("Cement");
  });

  it("includes variant rows when drilling into the parent material", () => {
    // A "43 Grade" variant whose parent_material_id points at mat-1 (the parent).
    const variantRow = makeRow({
      id: "rv",
      material_id: "mat-1-v43",
      material_name: "43 Grade",
      material: { id: "mat-1-v43", name: "43 Grade" },
      parent_material_id: "mat-1",
      parent_material_name: "Cement",
      usage_date: "2026-05-01",
    });
    const result = buildLedgerDetailEntries(
      [batchRow, variantRow, otherMaterialRow],
      "mat-1",
      usersByAuthId,
      usersById,
      sitesById,
    );
    const ids = result.map((r) => r.id);
    expect(ids).toContain("rv"); // variant included via parent match
    expect(ids).toContain("r1"); // direct parent usage included
    expect(ids).not.toContain("r3"); // unrelated material excluded
    const variantEntry = result.find((r) => r.id === "rv")!;
    expect(variantEntry.material_name).toBe("43 Grade");
  });
});
