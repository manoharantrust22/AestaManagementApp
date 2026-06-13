import { describe, it, expect } from "vitest";
import { pickInventoryMatch, type StockRow } from "./useMaterialThreads";

// A group batch's stock physically lands at whichever cluster site received the
// delivery. When the thread's MR was raised by site A but the goods landed at
// sibling site B, the same-site (`mr.site_id`) candidate list is empty and the
// match must fall back to the cluster-wide rollup keyed by batch_code alone.
// pickInventoryMatch encodes that resolution order as a pure, testable unit.

const SITE_A = "site-a"; // requesting / MR site
const SITE_B = "site-b"; // sibling cluster site where the delivery landed
const MAT = "mat-ppc";

function entry(
  over: Partial<StockRow> & { used?: number } = {}
): { stock: StockRow; used: number } {
  const { used, ...stock } = over;
  return {
    stock: {
      id: "inv-1",
      site_id: SITE_A,
      material_id: MAT,
      current_qty: 0,
      available_qty: 0,
      batch_code: null,
      last_received_date: null,
      ...stock,
    },
    used: used ?? 0,
  };
}

describe("pickInventoryMatch", () => {
  it("prefers the same-site batch_code match even when a cluster row exists (unchanged behavior)", () => {
    const candidates = [entry({ id: "same", site_id: SITE_A, batch_code: "B1" })];
    const clusterRows = [entry({ id: "sibling", site_id: SITE_B, batch_code: "B1" })];
    const m = pickInventoryMatch({ candidates, clusterRows, batchCode: "B1", materialId: MAT });
    expect(m?.stock.id).toBe("same");
    expect(m?.stock.site_id).toBe(SITE_A);
  });

  it("falls back to the sibling-site cluster row when the same-site lookup misses (THE BUG)", () => {
    const candidates: ReturnType<typeof entry>[] = []; // requesting site has no row for this batch
    const clusterRows = [entry({ id: "sibling", site_id: SITE_B, batch_code: "B1", current_qty: 200 })];
    const m = pickInventoryMatch({ candidates, clusterRows, batchCode: "B1", materialId: MAT });
    expect(m?.stock.id).toBe("sibling");
    expect(m?.stock.site_id).toBe(SITE_B);
  });

  it("prefers the cluster row whose material_id matches when several share the batch_code", () => {
    const candidates: ReturnType<typeof entry>[] = [];
    const clusterRows = [
      entry({ id: "other-variant", site_id: SITE_B, batch_code: "B1", material_id: "mat-other" }),
      entry({ id: "right-variant", site_id: SITE_B, batch_code: "B1", material_id: MAT }),
    ];
    const m = pickInventoryMatch({ candidates, clusterRows, batchCode: "B1", materialId: MAT });
    expect(m?.stock.id).toBe("right-variant");
  });

  it("uses the first cluster row when none matches the material exactly", () => {
    const candidates: ReturnType<typeof entry>[] = [];
    const clusterRows = [
      entry({ id: "first", site_id: SITE_B, batch_code: "B1", material_id: "mat-x" }),
      entry({ id: "second", site_id: SITE_B, batch_code: "B1", material_id: "mat-y" }),
    ];
    const m = pickInventoryMatch({ candidates, clusterRows, batchCode: "B1", materialId: MAT });
    expect(m?.stock.id).toBe("first");
  });

  it("does NOT use the cluster fallback when there is no batchCode — returns the shared own-pool bucket", () => {
    const candidates = [entry({ id: "shared", site_id: SITE_A, batch_code: null })];
    // clusterRows would be [] in practice (caller only passes them when batchCode is set),
    // but assert the guard regardless: even if rows are supplied, no batchCode = no fallback.
    const clusterRows = [entry({ id: "sibling", site_id: SITE_B, batch_code: "B1" })];
    const m = pickInventoryMatch({ candidates, clusterRows, batchCode: null, materialId: MAT });
    expect(m?.stock.id).toBe("shared");
    expect(m?.stock.batch_code).toBeNull();
  });

  it("falls back to the same-site shared bucket when a batchCode is set but unmatched anywhere", () => {
    const candidates = [entry({ id: "shared", site_id: SITE_A, batch_code: null })];
    const clusterRows: ReturnType<typeof entry>[] = []; // cluster has no row for this batch
    const m = pickInventoryMatch({ candidates, clusterRows, batchCode: "B1", materialId: MAT });
    expect(m?.stock.id).toBe("shared");
  });

  it("returns undefined when nothing matches", () => {
    expect(
      pickInventoryMatch({ candidates: [], clusterRows: [], batchCode: "B1", materialId: MAT })
    ).toBeUndefined();
    expect(
      pickInventoryMatch({ candidates: [], clusterRows: [], batchCode: null, materialId: MAT })
    ).toBeUndefined();
  });
});