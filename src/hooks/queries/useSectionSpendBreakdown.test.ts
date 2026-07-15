import { describe, expect, it } from "vitest";
import { bucketMiscCategory } from "./useSectionSpendBreakdown";

describe("bucketMiscCategory", () => {
  it("routes Material* categories to materials", () => {
    expect(bucketMiscCategory("Material Expenses")).toBe("materials");
    expect(bucketMiscCategory("Material Settlement")).toBe("materials");
    expect(bucketMiscCategory("Material Purchasing")).toBe("materials");
    expect(bucketMiscCategory("  material expenses  ")).toBe("materials");
  });

  it("routes Rental* categories to rentals", () => {
    expect(bucketMiscCategory("Rental Settlement")).toBe("rentals");
    expect(bucketMiscCategory("rental settlement")).toBe("rentals");
  });

  it("routes everything else (incl. labor-ish misc categories) to other", () => {
    expect(bucketMiscCategory("General Expense")).toBe("other");
    expect(bucketMiscCategory("Tea & Snacks Settlement")).toBe("other");
    expect(bucketMiscCategory("Daily Labor Settlement")).toBe("other");
    expect(bucketMiscCategory("Contract Labor Settlement")).toBe("other");
  });

  it("treats missing/blank category as other", () => {
    expect(bucketMiscCategory(null)).toBe("other");
    expect(bucketMiscCategory(undefined)).toBe("other");
    expect(bucketMiscCategory("")).toBe("other");
    expect(bucketMiscCategory("   ")).toBe("other");
  });
});
