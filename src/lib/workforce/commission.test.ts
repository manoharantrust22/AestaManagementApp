import { describe, it, expect } from "vitest";
import {
  mesthriCommissionOf,
  netOfCommission,
  splitCrewCommissionByDate,
  type CommissionDayRow,
} from "./commission";

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

describe("splitCrewCommissionByDate", () => {
  // WaterTank-shaped crew days (maistry Jithin already excluded by the caller).
  const rows: CommissionDayRow[] = [
    // Hemanta — 3 days, all early
    { date: "2026-07-02", workDays: 1.5, dailyEarnings: 1200, commissionPerDay: 50 },
    { date: "2026-07-03", workDays: 1.5, dailyEarnings: 1200, commissionPerDay: 50 },
    { date: "2026-07-04", workDays: 1.5, dailyEarnings: 1200, commissionPerDay: 50 },
    // Jugeswar — 3 days, all early
    { date: "2026-06-30", workDays: 1.0, dailyEarnings: 950, commissionPerDay: 50 },
    { date: "2026-07-02", workDays: 1.5, dailyEarnings: 1425, commissionPerDay: 50 },
    { date: "2026-07-04", workDays: 1.5, dailyEarnings: 1425, commissionPerDay: 50 },
    // Sadha — 1 early, 1 on cutover
    { date: "2026-07-03", workDays: 1.5, dailyEarnings: 1200, commissionPerDay: 50 },
    { date: "2026-07-07", workDays: 1.0, dailyEarnings: 800, commissionPerDay: 50 },
    // Utam — 1 early, 1 on cutover
    { date: "2026-07-03", workDays: 1.0, dailyEarnings: 800, commissionPerDay: 50 },
    { date: "2026-07-07", workDays: 1.0, dailyEarnings: 800, commissionPerDay: 50 },
  ];

  it("cutover 2026-07-07 excludes the pre-cutover work (11 work-days / ₹550)", () => {
    const s = splitCrewCommissionByDate(rows, "2026-07-07");
    expect(s.includedWorkDays).toBe(2);
    expect(s.includedCommission).toBe(100);
    expect(s.excludedWorkDays).toBe(11);
    expect(s.excludedCommission).toBe(550);
  });

  it("cutover 2026-06-30 includes everything (13 work-days / ₹650)", () => {
    const s = splitCrewCommissionByDate(rows, "2026-06-30");
    expect(s.includedWorkDays).toBe(13);
    expect(s.includedCommission).toBe(650);
    expect(s.excludedWorkDays).toBe(0);
    expect(s.excludedCommission).toBe(0);
  });

  it("null cutover = no gate, everything included", () => {
    const s = splitCrewCommissionByDate(rows, null);
    expect(s.includedWorkDays).toBe(13);
    expect(s.includedCommission).toBe(650);
    expect(s.excludedCommission).toBe(0);
  });

  it("empty rows → all zeros", () => {
    const s = splitCrewCommissionByDate([], "2026-07-07");
    expect(s).toEqual({
      includedWorkDays: 0,
      includedCommission: 0,
      excludedWorkDays: 0,
      excludedCommission: 0,
    });
  });
});
