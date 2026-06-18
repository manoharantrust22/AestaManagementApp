import { describe, it, expect } from "vitest";
import { computeProfitability, computeAdvanceSafety } from "./profitability";

describe("computeProfitability", () => {
  it("computes the negotiation saving for an estimate basis (est daywork − price)", () => {
    // Estimate 21 man-days × ₹700 = ₹14,700 daywork; package priced ₹12,000.
    const r = computeProfitability({
      totalValue: 12000,
      manDays: 21,
      benchmarkDailyRate: 700,
      retentionPercent: 0,
      totalUnits: null,
    });
    expect(r.daywageBenchmarkCost).toBe(14700);
    expect(r.companySaving).toBe(2700);
    expect(r.savingPct).toBeCloseTo(18.37, 1);
  });

  it("estimate preview: saving is the negotiation margin; crew-effective is price ÷ man-days", () => {
    // Estimate 4 crew × 5 days = 20 man-days at ₹700 → ₹14,000 daywork; price ₹12,000.
    const r = computeProfitability({
      totalValue: 12000,
      manDays: 20,
      benchmarkDailyRate: 700,
      retentionPercent: 0,
      totalUnits: null,
    });
    expect(r.daywageBenchmarkCost).toBe(14000); // 20 × 700
    expect(r.companySaving).toBe(2000); // 14000 − 12000 (locked negotiation margin)
    expect(r.crewEffectiveDaily).toBe(600); // 12000 / 20 at the estimate
    // The genuine win-win (crew earns > benchmark) emerges in the VIEW once the
    // crew finishes in fewer ACTUAL man-days; the helper here is the estimate lens.
  });

  it("returns null crew-effective and null saving-% when no man-days are given", () => {
    const r = computeProfitability({
      totalValue: 50000,
      manDays: 0,
      benchmarkDailyRate: 700,
      retentionPercent: 10,
      totalUnits: null,
    });
    expect(r.crewEffectiveDaily).toBeNull();
    expect(r.daywageBenchmarkCost).toBe(0);
    expect(r.savingPct).toBeNull();
    expect(r.retentionHeld).toBe(5000); // 10% of 50000
  });

  it("computes ₹/unit only when rate-measured", () => {
    const measured = computeProfitability({
      totalValue: 48000,
      manDays: 40,
      benchmarkDailyRate: 700,
      retentionPercent: 0,
      totalUnits: 1200, // sqft
    });
    expect(measured.computedRatePerUnit).toBe(40); // 48000 / 1200 sqft

    const lump = computeProfitability({
      totalValue: 48000,
      manDays: 40,
      benchmarkDailyRate: 700,
      retentionPercent: 0,
      totalUnits: null,
    });
    expect(lump.computedRatePerUnit).toBeNull();
  });

  it("tolerates missing/zero benchmark without dividing by zero", () => {
    const r = computeProfitability({
      totalValue: 10000,
      manDays: 12,
      benchmarkDailyRate: null,
      retentionPercent: null,
      totalUnits: null,
    });
    expect(r.daywageBenchmarkCost).toBe(0);
    expect(r.savingPct).toBeNull();
    expect(r.companySaving).toBe(-10000);
    expect(r.crewEffectiveDaily).toBeCloseTo(833.33, 1);
  });
});

describe("computeAdvanceSafety", () => {
  it("flags over-advancing when money runs ahead of estimated progress", () => {
    // Estimate 6 crew × 5 days = 30 man-days. Only 9 logged → 30% done.
    // Paid 70% of price → well ahead of progress.
    const r = computeAdvanceSafety({
      paid: 70000,
      totalValue: 100000,
      actualManDays: 9,
      estimatedCrewSize: 6,
      estimatedDays: 5,
    });
    expect(r.paidFraction).toBeCloseTo(0.7, 5);
    expect(r.progressFraction).toBeCloseTo(0.3, 5);
    expect(r.overAdvanced).toBe(true);
  });

  it("does not flag when advances track progress within the margin", () => {
    const r = computeAdvanceSafety({
      paid: 40000,
      totalValue: 100000,
      actualManDays: 15, // 50% of the 30 man-day estimate
      estimatedCrewSize: 6,
      estimatedDays: 5,
    });
    expect(r.overAdvanced).toBe(false);
  });

  it("never raises a false alarm when there is no estimate to compare against", () => {
    const r = computeAdvanceSafety({
      paid: 95000,
      totalValue: 100000,
      actualManDays: 2,
      estimatedCrewSize: null,
      estimatedDays: null,
    });
    expect(r.progressFraction).toBeNull();
    expect(r.overAdvanced).toBe(false);
  });

  it("caps progress at 100% even if more man-days are logged than estimated", () => {
    const r = computeAdvanceSafety({
      paid: 50000,
      totalValue: 100000,
      actualManDays: 60, // double the 30 man-day estimate
      estimatedCrewSize: 6,
      estimatedDays: 5,
    });
    expect(r.progressFraction).toBe(1);
    expect(r.overAdvanced).toBe(false);
  });
});
