import { describe, it, expect } from "vitest";
import { deriveKind } from "../useMaterialThreads";
import type {
  MaterialRequestWithDetails,
  PurchaseOrderWithDetails,
} from "@/types/material.types";

/**
 * deriveKind decides whether a Hub thread is GROUP (shared cluster pool) or OWN
 * (a site's dedicated purchase). The SETTLED expense's purchase_type is the
 * source of truth; a PO's site_group_id (set merely because the site is in a
 * cluster) must NOT promote an own-site buy to "group" — that was the bug behind
 * the "810 vs 840" PPC mismatch (own-site batch MAT-260227-E1EB shown as group).
 */

const mr = (purchase_type: string | null = null) =>
  ({ purchase_type } as unknown as MaterialRequestWithDetails);
const po = (over: { site_group_id?: string | null; notes?: string } = {}) =>
  ({ site_group_id: null, notes: "", ...over } as unknown as PurchaseOrderWithDetails);
const settle = (purchase_type: string | null) => ({ purchase_type } as any);

describe("deriveKind", () => {
  it("own-site expense beats a cluster site_group_id (the E1EB case) → own", () => {
    // PO sits in a cluster (site_group_id set) and even the stale MR says
    // group_stock, but the settled expense is own_site → it's an OWN buy.
    expect(
      deriveKind(mr("group_stock"), po({ site_group_id: "grp" }), settle("own_site"))
    ).toBe("own");
  });

  it("group_stock expense → group", () => {
    expect(deriveKind(mr(null), po({ site_group_id: null }), settle("group_stock"))).toBe(
      "group"
    );
  });

  it("no settled expense + PO carries site_group_id → group (fallback unchanged)", () => {
    expect(deriveKind(mr(null), po({ site_group_id: "grp" }), undefined)).toBe("group");
  });

  it("no settled expense + [GROUP STOCK] marker in notes → group", () => {
    expect(deriveKind(mr(null), po({ notes: "advance [GROUP STOCK] cement" }), undefined)).toBe(
      "group"
    );
  });

  it("no settled expense + plain own PO → own", () => {
    expect(deriveKind(mr(null), po(), undefined)).toBe("own");
  });

  it("settlement with null purchase_type falls through to the PO heuristic", () => {
    expect(deriveKind(mr(null), po({ site_group_id: "grp" }), settle(null))).toBe("group");
  });

  it("no PO: uses mr.purchase_type", () => {
    expect(deriveKind(mr("group_stock"), undefined, undefined)).toBe("group");
    expect(deriveKind(mr("own_site"), undefined, undefined)).toBe("own");
  });
});
