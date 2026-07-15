import { describe, expect, it } from "vitest";
import { computeMesthriStrip } from "./mesthriStripMath";

// Real WaterTank/Jithin figures: own labour ₹15,750 (₹9,800 already paid),
// commission accrued ₹1,825, plus ₹3,000 of older site-wide untagged payouts.
const jithin = {
  ownNet: 15750,
  ownPaid: 9800,
  commissionAccrued: 1825,
  commissionPaid: 0,
  untaggedCommissionPaid: 3000,
  commissionApplies: true,
};

describe("computeMesthriStrip", () => {
  it("leads with what is still owed, and demotes the lifetime total", () => {
    const v = computeMesthriStrip(jithin);
    expect(v.ownRemaining).toBe(5950);
    expect(v.commissionRemaining).toBe(1825);
    expect(v.stillToPay).toBe(7775);
    expect(v.totalPaid).toBe(9800);
    expect(v.totalEarned).toBe(17575);
    expect(v.pctPaid).toBe(56);
    expect(v.isSettled).toBe(false);
  });

  it("reports untagged site-wide commission so it is never silently counted", () => {
    expect(computeMesthriStrip(jithin).untaggedNote).toBe(3000);
  });

  it("subtracts commission that IS tagged to this contract", () => {
    const v = computeMesthriStrip({ ...jithin, commissionPaid: 1000 });
    expect(v.commissionRemaining).toBe(825);
    expect(v.stillToPay).toBe(6775);
    expect(v.totalPaid).toBe(10800);
  });

  it("ignores commission entirely when commissionApplies is false", () => {
    const v = computeMesthriStrip({ ...jithin, commissionApplies: false });
    expect(v.commissionRemaining).toBe(0);
    expect(v.stillToPay).toBe(5950);
    expect(v.totalEarned).toBe(15750);
    expect(v.untaggedNote).toBe(0);
  });

  it("marks fully-paid as settled at 100%", () => {
    const v = computeMesthriStrip({
      ownNet: 15750, ownPaid: 15750, commissionAccrued: 1825,
      commissionPaid: 1825, untaggedCommissionPaid: 0, commissionApplies: true,
    });
    expect(v.stillToPay).toBe(0);
    expect(v.isSettled).toBe(true);
    expect(v.pctPaid).toBe(100);
  });

  it("treats a sub-rupee residue as settled (float noise, not real debt)", () => {
    const v = computeMesthriStrip({
      ownNet: 15750.4, ownPaid: 15750, commissionAccrued: 0,
      commissionPaid: 0, untaggedCommissionPaid: 0, commissionApplies: true,
    });
    expect(v.isSettled).toBe(true);
  });

  it("clamps overpayment to zero rather than showing negative debt", () => {
    const v = computeMesthriStrip({
      ownNet: 15750, ownPaid: 20000, commissionAccrued: 0,
      commissionPaid: 0, untaggedCommissionPaid: 0, commissionApplies: true,
    });
    expect(v.ownRemaining).toBe(0);
    expect(v.stillToPay).toBe(0);
  });

  it("does not divide by zero on a contract with no earnings yet", () => {
    const v = computeMesthriStrip({
      ownNet: 0, ownPaid: 0, commissionAccrued: 0,
      commissionPaid: 0, untaggedCommissionPaid: 0, commissionApplies: true,
    });
    expect(v.pctPaid).toBe(0);
    expect(v.isSettled).toBe(false);
  });
});
