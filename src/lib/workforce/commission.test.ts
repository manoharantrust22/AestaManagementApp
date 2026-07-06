import { describe, it, expect } from "vitest";
import { mesthriCommissionOf, netOfCommission } from "./commission";

describe("mesthriCommissionOf", () => {
  it("full day at the ₹50 default = ₹50", () => {
    // helper earning ₹800 for a full day, rate 50
    expect(mesthriCommissionOf(true, 800, 50, 1)).toBe(50);
  });

  it("half day = half the commission (₹25)", () => {
    // half work-day: earnings 400, work_days 0.5
    expect(mesthriCommissionOf(true, 400, 50, 0.5)).toBe(25);
  });

  it("respects a per-laborer rate of ₹60", () => {
    expect(mesthriCommissionOf(true, 800, 60, 1)).toBe(60);
    expect(mesthriCommissionOf(true, 400, 60, 0.5)).toBe(30);
  });

  it("double day scales with work_days", () => {
    expect(mesthriCommissionOf(true, 1600, 50, 2)).toBe(100);
  });

  it("is floored at the day's earnings (never exceeds pay → net ≥ 0)", () => {
    // a very low day-rate laborer earning ₹40 can only pass ₹40, not ₹50
    expect(mesthriCommissionOf(true, 40, 50, 1)).toBe(40);
    expect(netOfCommission(40, mesthriCommissionOf(true, 40, 50, 1))).toBe(0);
  });

  it("is 0 when not a commission crew day (disabled / self / market)", () => {
    expect(mesthriCommissionOf(false, 800, 50, 1)).toBe(0);
  });

  it("defaults null work_days to 1 and null rate to 0", () => {
    expect(mesthriCommissionOf(true, 800, 50, null)).toBe(50);
    expect(mesthriCommissionOf(true, 800, null, 1)).toBe(0);
    expect(mesthriCommissionOf(true, null, 50, 1)).toBe(0);
  });
});

describe("netOfCommission", () => {
  it("net = gross − commission", () => {
    const gross = 800;
    const comm = mesthriCommissionOf(true, gross, 50, 1);
    expect(netOfCommission(gross, comm)).toBe(750);
  });

  it("mesthri own day (not crew) keeps full gross", () => {
    const gross = 1000;
    const comm = mesthriCommissionOf(false, gross, 50, 1);
    expect(netOfCommission(gross, comm)).toBe(1000);
  });
});
