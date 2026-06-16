import { describe, it, expect } from "vitest";
import {
  eligibleOffsetPurchases,
  suggestedOffsetAmount,
  offsetReference,
  offsetNote,
  type OffsetPurchase,
} from "./offsetPurchase";

const DEBTOR = "site-debtor";
const OTHER = "site-other";

function purchase(over: Partial<OffsetPurchase> & { id: string }): OffsetPurchase {
  return {
    ref_code: "MAT-1",
    paying_site_id: DEBTOR,
    site_id: DEBTOR,
    total_amount: 5000,
    status: "completed",
    purchase_date: "2026-06-01",
    vendor_name: "Vendor A",
    ...over,
  };
}

describe("eligibleOffsetPurchases", () => {
  it("keeps only purchases the debtor funded", () => {
    const rows = [
      purchase({ id: "a", paying_site_id: DEBTOR }),
      purchase({ id: "b", paying_site_id: OTHER }),
      // funded via owning site when paying_site_id is null
      purchase({ id: "c", paying_site_id: null, site_id: DEBTOR }),
      purchase({ id: "d", paying_site_id: null, site_id: OTHER }),
    ];
    expect(eligibleOffsetPurchases(rows, DEBTOR).map((p) => p.id).sort()).toEqual(["a", "c"]);
  });

  it("drops zero-value and non-offsettable statuses", () => {
    const rows = [
      purchase({ id: "a", total_amount: 0 }),
      purchase({ id: "b", status: "converted" }),
      purchase({ id: "c", status: "completed" }),
    ];
    expect(eligibleOffsetPurchases(rows, DEBTOR).map((p) => p.id)).toEqual(["c"]);
  });

  it("sorts newest first", () => {
    const rows = [
      purchase({ id: "old", purchase_date: "2026-01-01" }),
      purchase({ id: "new", purchase_date: "2026-06-01" }),
    ];
    expect(eligibleOffsetPurchases(rows, DEBTOR).map((p) => p.id)).toEqual(["new", "old"]);
  });

  it("excludes purchases already used as an offset", () => {
    const rows = [purchase({ id: "a" }), purchase({ id: "b" })];
    const used = new Set(["a"]);
    expect(eligibleOffsetPurchases(rows, DEBTOR, used).map((p) => p.id)).toEqual(["b"]);
  });
});

describe("suggestedOffsetAmount", () => {
  it("offsets the whole debt when the purchase is larger", () => {
    expect(suggestedOffsetAmount(20000, 12600)).toBe(12600);
  });
  it("offsets partially when the purchase is smaller", () => {
    expect(suggestedOffsetAmount(5000, 12600)).toBe(5000);
  });
  it("never goes negative", () => {
    expect(suggestedOffsetAmount(5000, 0)).toBe(0);
    expect(suggestedOffsetAmount(-1, 100)).toBe(0);
  });
});

describe("offset reference + note", () => {
  it("builds an OFFSET- reference", () => {
    expect(offsetReference("MAT-260601-7A41")).toBe("OFFSET-MAT-260601-7A41");
  });
  it("describes the purchase in the note", () => {
    expect(offsetNote(purchase({ id: "a", ref_code: "MAT-1", vendor_name: "Sathish" }))).toContain(
      "MAT-1"
    );
    expect(offsetNote(purchase({ id: "a", vendor_name: null, vendor: { name: "Fallback" } }))).toContain(
      "Fallback"
    );
  });
});
