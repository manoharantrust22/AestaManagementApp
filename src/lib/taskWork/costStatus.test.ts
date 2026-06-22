import { describe, it, expect } from "vitest";
import { computeCostStatus } from "./costStatus";

describe("computeCostStatus", () => {
  it("is unknown when no work has been costed yet", () => {
    const r = computeCostStatus({ effectiveAgreed: 43500, workValue: 0, paid: 12000 });
    expect(r.verdict).toBe("unknown");
    expect(r.balance).toBe(31500);
  });

  it("flags 'ahead' when paid is well above work value (overpaid exposure)", () => {
    // workValue 10k, paid 15k → +5k (50% > 20% threshold)
    const r = computeCostStatus({ effectiveAgreed: 43500, workValue: 10000, paid: 15000 });
    expect(r.paidVsWork).toBe(5000);
    expect(r.verdict).toBe("ahead");
  });

  it("flags 'behind' when paid trails work value (underpaid)", () => {
    // workValue 20k, paid 10k → -10k (-50% < -20%)
    const r = computeCostStatus({ effectiveAgreed: 43500, workValue: 20000, paid: 10000 });
    expect(r.paidVsWork).toBe(-10000);
    expect(r.verdict).toBe("behind");
  });

  it("is 'fair' within the ±20% tolerance band", () => {
    // workValue 10k, paid 11k → +10% (within ±20%)
    const r = computeCostStatus({ effectiveAgreed: 43500, workValue: 10000, paid: 11000 });
    expect(r.verdict).toBe("fair");
  });

  it("computes dealMargin and balance against the effective agreed price", () => {
    const r = computeCostStatus({ effectiveAgreed: 47000, workValue: 40000, paid: 35000 });
    expect(r.dealMargin).toBe(7000); // 47000 − 40000
    expect(r.balance).toBe(12000); // 47000 − 35000
  });

  it("clamps negative/garbage inputs to 0", () => {
    const r = computeCostStatus({
      effectiveAgreed: -1 as unknown as number,
      workValue: NaN as unknown as number,
      paid: 5000,
    });
    expect(r.verdict).toBe("unknown");
    expect(r.balance).toBe(-5000); // 0 − 5000
  });
});
