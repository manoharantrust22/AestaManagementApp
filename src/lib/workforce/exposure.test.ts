import { describe, it, expect } from "vitest";
import {
  computeExposure,
  severityFor,
  meterGeometry,
  rollupTasks,
  goodDealSaving,
  MAX_RATIO,
} from "./exposure";

describe("severityFor", () => {
  it("returns none only when nothing started (work 0 and paid 0)", () => {
    expect(severityFor(0, 0, 0)).toBe("none");
  });

  it("returns high when paid well ahead (ratio > 0.15)", () => {
    expect(severityFor(0.2, 50000, 0.3)).toBe("high");
    expect(severityFor(0.1501, 1, 0.1)).toBe("high");
  });

  it("returns watch when slightly ahead (0.04 < ratio <= 0.15)", () => {
    expect(severityFor(0.05, 1, 0.1)).toBe("watch");
    expect(severityFor(0.15, 1, 0.1)).toBe("watch"); // 0.15 is not > 0.15
  });

  it("returns instep inside the dead band [-0.04, 0.04]", () => {
    expect(severityFor(0, 1, 0.5)).toBe("instep");
    expect(severityFor(0.04, 1, 0.5)).toBe("instep");
    expect(severityFor(-0.04, 1, 0.5)).toBe("instep");
  });

  it("returns safe when money is held back (ratio < -0.04)", () => {
    expect(severityFor(-0.1, 0, 0.5)).toBe("safe");
  });

  it("paid-ahead with zero work but non-zero paid is NOT none", () => {
    // work 0, paid 10000, quoted 50000 -> ratio 0.2 -> high
    expect(severityFor(0.2, 10000, 0)).toBe("high");
  });
});

describe("computeExposure", () => {
  it("flags untracked when work is null", () => {
    const r = computeExposure({ quoted: 100000, paid: 40000, work: null });
    expect(r.tracked).toBe(false);
    expect(r.severity).toBe("untracked");
    expect(r.exposure).toBeNull();
    expect(r.ratio).toBeNull();
    expect(r.workValue).toBeNull();
  });

  it("computes paid-ahead exposure (positive) as high risk", () => {
    // quoted 100000, 30% done -> workValue 30000; paid 60000 -> exposure +30000 -> ratio 0.3
    const r = computeExposure({ quoted: 100000, paid: 60000, work: 0.3 });
    expect(r.workValue).toBe(30000);
    expect(r.exposure).toBe(30000);
    expect(r.ratio).toBeCloseTo(0.3, 6);
    expect(r.severity).toBe("high");
  });

  it("computes held-back exposure (negative) as safe", () => {
    // quoted 100000, 60% done -> workValue 60000; paid 40000 -> exposure -20000 -> ratio -0.2
    const r = computeExposure({ quoted: 100000, paid: 40000, work: 0.6 });
    expect(r.exposure).toBe(-20000);
    expect(r.ratio).toBeCloseTo(-0.2, 6);
    expect(r.severity).toBe("safe");
  });

  it("is in step when paid tracks work", () => {
    const r = computeExposure({ quoted: 100000, paid: 50000, work: 0.5 });
    expect(r.exposure).toBe(0);
    expect(r.severity).toBe("instep");
  });

  it("treats not-started (work 0, paid 0) as none", () => {
    const r = computeExposure({ quoted: 100000, paid: 0, work: 0 });
    expect(r.severity).toBe("none");
  });

  it("guards against divide-by-zero when quoted is 0", () => {
    const r = computeExposure({ quoted: 0, paid: 5000, work: 0 });
    expect(r.ratio).toBe(0);
    expect(Number.isNaN(r.ratio as number)).toBe(false);
  });
});

describe("meterGeometry", () => {
  it("centres at 50% when in step", () => {
    const g = meterGeometry(0);
    expect(g.fillLeftPct).toBe(50);
    expect(g.fillWidthPct).toBe(0);
    expect(g.markerPct).toBe(50);
  });

  it("extends right for positive (exposed) ratio", () => {
    // ratio 0.15 -> w = 0.15/0.30 * 50 = 25
    const g = meterGeometry(0.15);
    expect(g.fillLeftPct).toBe(50);
    expect(g.fillWidthPct).toBeCloseTo(25, 6);
    expect(g.markerPct).toBeCloseTo(75, 6);
  });

  it("extends left for negative (safe) ratio", () => {
    // ratio -0.15 -> w = 25, fill starts at 25, marker at 25
    const g = meterGeometry(-0.15);
    expect(g.fillLeftPct).toBeCloseTo(25, 6);
    expect(g.fillWidthPct).toBeCloseTo(25, 6);
    expect(g.markerPct).toBeCloseTo(25, 6);
  });

  it("clamps beyond ±MAX_RATIO to the rail ends (±50%)", () => {
    const hi = meterGeometry(0.9);
    expect(hi.fillWidthPct).toBeCloseTo(50, 6);
    expect(hi.markerPct).toBeCloseTo(100, 6);
    const lo = meterGeometry(-0.9);
    expect(lo.fillLeftPct).toBeCloseTo(0, 6);
    expect(lo.markerPct).toBeCloseTo(0, 6);
    expect(MAX_RATIO).toBe(0.3);
  });
});

describe("rollupTasks", () => {
  it("sums paid/quoted over all but exposure aggregates over tracked only", () => {
    const r = rollupTasks([
      { quoted: 100000, paid: 60000, work: 0.3 }, // tracked, exposure +30000
      { quoted: 50000, paid: 10000, work: 0.5 }, // tracked, exposure -15000
      { quoted: 80000, paid: 20000, work: null }, // untracked -> excluded from exposure
    ]);
    expect(r.paid).toBe(90000); // 60k + 10k + 20k
    expect(r.quoted).toBe(230000);
    expect(r.quotedTracked).toBe(150000);
    expect(r.paidTracked).toBe(70000);
    expect(r.workValue).toBe(30000 + 25000); // 55000
    expect(r.exposure).toBe(70000 - 55000); // 15000
    expect(r.atRisk).toBe(30000); // only the positive-exposure task
    expect(r.trackedCount).toBe(2);
    expect(r.untrackedCount).toBe(1);
    expect(r.total).toBe(3);
  });

  it("returns zeros / no NaN for an all-untracked or empty set", () => {
    const empty = rollupTasks([]);
    expect(empty.ratio).toBe(0);
    expect(empty.atRisk).toBe(0);
    const allUntracked = rollupTasks([
      { quoted: 100000, paid: 40000, work: null },
    ]);
    expect(allUntracked.ratio).toBe(0);
    expect(allUntracked.atRisk).toBe(0);
    expect(allUntracked.paid).toBe(40000);
    expect(allUntracked.untrackedCount).toBe(1);
  });
});

describe("goodDealSaving", () => {
  it("returns positive saving when benchmark exceeds the agreed price", () => {
    expect(goodDealSaving(14400, 12000)).toBe(2400);
  });
  it("clamps negative savings (over-priced) to 0", () => {
    expect(goodDealSaving(10000, 12000)).toBe(0);
  });
  it("returns null when there is no benchmark", () => {
    expect(goodDealSaving(null, 12000)).toBeNull();
    expect(goodDealSaving(0, 12000)).toBeNull();
  });
});
