import { describe, expect, it } from "vitest";
import { pctsAreValid, splitStaffPayment } from "./split";

const sum = (xs: { amount: number }[]) => Math.round(xs.reduce((a, b) => a + b.amount, 0) * 100) / 100;

describe("splitStaffPayment", () => {
  it("splits equally and gives the remainder to the first site", () => {
    const out = splitStaffPayment(1000, [{ siteId: "a" }, { siteId: "b" }, { siteId: "c" }]);
    expect(out.map((s) => s.amount)).toEqual([333.34, 333.33, 333.33]);
    expect(sum(out)).toBe(1000);
  });

  it("handles a single site", () => {
    expect(splitStaffPayment(25000, [{ siteId: "a" }])).toEqual([{ siteId: "a", pct: 100, amount: 25000 }]);
  });

  it("respects custom percentages", () => {
    const out = splitStaffPayment(25000, [
      { siteId: "a", pct: 60 },
      { siteId: "b", pct: 40 },
    ]);
    expect(out.map((s) => s.amount)).toEqual([15000, 10000]);
  });

  it("always sums exactly for awkward amounts", () => {
    for (const amt of [1, 0.01, 999.99, 12345.67, 5001]) {
      for (const n of [2, 3, 6, 7]) {
        const out = splitStaffPayment(amt, Array.from({ length: n }, (_, i) => ({ siteId: String(i) })));
        expect(sum(out)).toBe(Math.round(amt * 100) / 100);
        out.forEach((s) => expect(s.amount).toBeGreaterThanOrEqual(0));
      }
    }
  });

  it("returns nothing for no sites or non-positive amount", () => {
    expect(splitStaffPayment(100, [])).toEqual([]);
    expect(splitStaffPayment(0, [{ siteId: "a" }])).toEqual([]);
  });
});

describe("pctsAreValid", () => {
  it("accepts 100 within tolerance and rejects others", () => {
    expect(pctsAreValid([50, 50])).toBe(true);
    expect(pctsAreValid([33.33, 33.33, 33.34])).toBe(true);
    expect(pctsAreValid([50, 40])).toBe(false);
    expect(pctsAreValid([])).toBe(false);
    expect(pctsAreValid([110, -10])).toBe(false);
  });
});
