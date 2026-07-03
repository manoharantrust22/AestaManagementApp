import { describe, it, expect } from "vitest";
import { sumScopeValues, type ScopeItem } from "./scopeSheet.types";

const item = (value?: number): ScopeItem => ({
  id: crypto.randomUUID(),
  label: "work",
  value,
  before: null,
  after: null,
});

describe("sumScopeValues", () => {
  it("returns 0 for an empty list", () => {
    expect(sumScopeValues([])).toBe(0);
  });

  it("sums plain values", () => {
    expect(sumScopeValues([item(10000), item(15000)])).toBe(25000);
  });

  it("ignores items without a value", () => {
    expect(sumScopeValues([item(5000), item(undefined), item(2500)])).toBe(7500);
  });

  it("ignores NaN, Infinity and non-positive values", () => {
    expect(
      sumScopeValues([item(NaN), item(Infinity), item(-100), item(0), item(300)])
    ).toBe(300);
  });

  it("rounds decimal sums to 2dp", () => {
    expect(sumScopeValues([item(0.1), item(0.2)])).toBe(0.3);
    expect(sumScopeValues([item(1000.555), item(0.001)])).toBe(1000.56);
  });
});
