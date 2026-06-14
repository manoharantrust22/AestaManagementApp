import { describe, it, expect } from "vitest";
import {
  NO_BRAND,
  brandKey,
  deriveBatchBrandKey,
  summarizeSiteSplit,
  validateSiteSplit,
} from "./batchUsageSplit";

// Mirrors the prod incident shape: a Chettinad group batch sitting alongside
// sibling group batches bought UNBRANDED. The "This batch" log-usage scope must
// lock to the clicked batch's brand, not default to a sibling's.
const BATCHES = [
  { ref_code: "MAT-9A6D", items: [{ material_id: "ppc", brand_id: "chettinad" }] },
  { ref_code: "MAT-5C52", items: [{ material_id: "ppc", brand_id: null }] },
  {
    ref_code: "MAT-MIX",
    items: [
      { material_id: "steel", brand_id: "tata" },
      { material_id: "ppc", brand_id: "chettinad" },
    ],
  },
];

describe("brandKey", () => {
  it("maps null/empty to the NO_BRAND sentinel", () => {
    expect(brandKey(null)).toBe(NO_BRAND);
    expect(brandKey(undefined)).toBe(NO_BRAND);
    expect(brandKey("")).toBe(NO_BRAND);
  });
  it("passes through a real brand id", () => {
    expect(brandKey("chettinad")).toBe("chettinad");
  });
});

describe("deriveBatchBrandKey", () => {
  it("locks to the clicked batch's brand even when an unbranded sibling exists", () => {
    // The bug: defaulting to the most-recent (unbranded) sibling filtered the
    // Chettinad batch out and falsely reported 'no remaining stock'.
    expect(deriveBatchBrandKey(BATCHES, "MAT-9A6D", "ppc")).toBe("chettinad");
  });
  it("returns the NO_BRAND sentinel for an unbranded batch", () => {
    expect(deriveBatchBrandKey(BATCHES, "MAT-5C52", "ppc")).toBe(NO_BRAND);
  });
  it("picks the matching material's item within a multi-line batch", () => {
    expect(deriveBatchBrandKey(BATCHES, "MAT-MIX", "ppc")).toBe("chettinad");
    expect(deriveBatchBrandKey(BATCHES, "MAT-MIX", "steel")).toBe("tata");
  });
  it("returns null when the ref, batch, or material is missing", () => {
    expect(deriveBatchBrandKey(BATCHES, null, "ppc")).toBeNull();
    expect(deriveBatchBrandKey(BATCHES, "MAT-UNKNOWN", "ppc")).toBeNull();
    expect(deriveBatchBrandKey(BATCHES, "MAT-9A6D", "cement-block")).toBeNull();
  });
});

describe("summarizeSiteSplit", () => {
  it("splits self-use (payer) vs inter-site debt (other sites)", () => {
    // 50-bag batch paid by Srinivasan: Srini 30 (self-use) + Padma 20 (owes).
    const s = summarizeSiteSplit(
      [
        { siteId: "srini", qty: 30 },
        { siteId: "padma", qty: 20 },
      ],
      "srini",
      100 // landed cost / bag
    );
    expect(s.total).toBe(50);
    expect(s.selfUse).toBe(3000);
    expect(s.interSite).toBe(2000);
    expect(s.owedSiteIds).toEqual(["padma"]);
  });

  it("ignores zero/blank rows", () => {
    const s = summarizeSiteSplit(
      [
        { siteId: "a", qty: 0 },
        { siteId: "b", qty: 5 },
      ],
      "a",
      10
    );
    expect(s.total).toBe(5);
    expect(s.selfUse).toBe(0);
    expect(s.interSite).toBe(50);
    expect(s.owedSiteIds).toEqual(["b"]);
  });

  it("treats everything as inter-site when the payer is unknown", () => {
    const s = summarizeSiteSplit([{ siteId: "a", qty: 4 }], null, 10);
    expect(s.selfUse).toBe(0);
    expect(s.interSite).toBe(40);
    expect(s.owedSiteIds).toEqual(["a"]);
  });
});

describe("validateSiteSplit", () => {
  it("allows partial usage and a full match", () => {
    expect(validateSiteSplit(30, 50)).toMatchObject({
      over: false,
      remainingAfter: 20,
      canSubmit: true,
    });
    expect(validateSiteSplit(50, 50)).toMatchObject({
      over: false,
      remainingAfter: 0,
      canSubmit: true,
    });
  });
  it("blocks over-allocation beyond the batch remaining", () => {
    expect(validateSiteSplit(60, 50)).toMatchObject({ over: true, canSubmit: false });
  });
  it("blocks an empty split", () => {
    expect(validateSiteSplit(0, 50)).toMatchObject({ canSubmit: false });
  });
});
