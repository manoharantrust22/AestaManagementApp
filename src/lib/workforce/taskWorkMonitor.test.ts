import { describe, it, expect } from "vitest";
import {
  estimateBenchmark,
  computeMonitor,
  type EstimateLine,
} from "./taskWorkMonitor";

describe("estimateBenchmark", () => {
  it("sums count × days × rate across worker-type lines", () => {
    const lines: EstimateLine[] = [
      { workerCount: 2, days: 6, dailyRate: 900 }, // 10,800
      { workerCount: 1, days: 6, dailyRate: 600 }, // 3,600
    ];
    expect(estimateBenchmark(lines)).toBe(14400);
  });

  it("is 0 for no lines", () => {
    expect(estimateBenchmark([])).toBe(0);
  });

  it("ignores negative/garbage values defensively", () => {
    expect(
      estimateBenchmark([
        { workerCount: -3, days: 6, dailyRate: 900 },
        { workerCount: 2, days: NaN as unknown as number, dailyRate: 900 },
      ])
    ).toBe(0);
  });
});

describe("computeMonitor", () => {
  it("computes expected saving from the benchmark (lump sum beats day wages)", () => {
    const r = computeMonitor({
      agreedPrice: 12000,
      benchmark: 14400,
      actualLaborValue: 0,
    });
    expect(r.expectedSaving).toBe(2400);
    expect(r.expectedSavingPct).toBeCloseTo(2400 / 14400);
  });

  it("returns null expected-saving when there is no benchmark", () => {
    const r = computeMonitor({
      agreedPrice: 12000,
      benchmark: 0,
      actualLaborValue: 0,
    });
    expect(r.expectedSaving).toBeNull();
    expect(r.expectedSavingPct).toBeNull();
  });

  it("verdict is 'unknown' when no attendance is tracked (actual = 0)", () => {
    const r = computeMonitor({
      agreedPrice: 12000,
      benchmark: 14400,
      actualLaborValue: 0,
    });
    expect(r.verdict).toBe("unknown");
    expect(r.margin).toBeNull();
  });

  it("verdict 'fair' when the crew's margin is small and positive", () => {
    const r = computeMonitor({
      agreedPrice: 11000,
      benchmark: 14400,
      actualLaborValue: 10000, // margin 1,000 = 10% → fair
    });
    expect(r.margin).toBe(1000);
    expect(r.verdict).toBe("fair");
  });

  it("verdict 'overpaid' when the lump sum far exceeds actual labour value", () => {
    const r = computeMonitor({
      agreedPrice: 18000,
      benchmark: 14400,
      actualLaborValue: 10000, // margin 8,000 = 80% → overpaid
    });
    expect(r.verdict).toBe("overpaid");
    expect(r.marginPct).toBeCloseTo(0.8);
  });

  it("verdict 'underpaid' when actual labour value exceeds the price", () => {
    const r = computeMonitor({
      agreedPrice: 9000,
      benchmark: 14400,
      actualLaborValue: 12000, // margin −3,000 → underpaid
    });
    expect(r.margin).toBe(-3000);
    expect(r.verdict).toBe("underpaid");
  });
});
