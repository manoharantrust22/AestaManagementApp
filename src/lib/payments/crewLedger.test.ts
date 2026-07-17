import { describe, expect, it } from "vitest";
import {
  allocatePayAllOwed,
  computeCrewStripView,
  mapCrewLedger,
  type CrewLedger,
} from "./crewLedger";

describe("mapCrewLedger", () => {
  it("returns disabled for a site without crew mode", () => {
    expect(mapCrewLedger({ enabled: false })).toEqual({ enabled: false });
    expect(mapCrewLedger(null)).toEqual({ enabled: false });
    expect(mapCrewLedger(undefined)).toEqual({ enabled: false });
  });

  it("maps a full payload into typed numbers and keeps week order (newest first)", () => {
    const raw = {
      enabled: true,
      config: {
        subcontract_id: "sub-1",
        mesthri_id: "jithin",
        mesthri_name: "Jithin",
        effective_from: "2026-07-12",
      },
      weeks: [
        {
          week_start: "2026-07-12",
          week_end: "2026-07-18",
          is_post_cutover: true,
          laborer_count: 3,
          wages_due: 8200,
          commission_total: 450,
          mesthri_own_gross: 1050,
          week_paid: 1500,
          rows: [
            {
              laborer_id: "jithin",
              name: "Jithin",
              role: "Mesthri",
              is_mesthri: true,
              days: 1.5,
              gross: 1050,
              commission: 0,
              net: 1050,
              earned: 1500,
              paid: 1500,
              unpaid: 0,
              payment_state: "paid_direct",
            },
            {
              laborer_id: "bulu",
              name: "Bulu Majhi",
              role: "Male Helper",
              is_mesthri: false,
              days: 2,
              gross: 1600,
              commission: 100,
              net: 1500,
              paid: 0,
              earned: 1500,
              unpaid: 1500,
              payment_state: "unpaid",
            },
          ],
        },
        {
          week_start: "2026-07-05",
          week_end: "2026-07-11",
          is_post_cutover: false,
          laborer_count: 5,
          wages_due: 9275,
          commission_total: 550,
          mesthri_own_gross: 0,
          week_paid: 9275,
          rows: [],
        },
      ],
      mesthri: {
        laborer_id: "jithin",
        name: "Jithin",
        own_gross: 6950,
        commission_accrued: 1825,
        own_paid: 3320,
        commission_paid: 0,
        commission_paid_direct: 0,
        pool_absorbed: 3320,
        own_remaining: 3630,
        commission_remaining: 1825,
        still_to_pay: 5455,
      },
      totals: {
        weeks_count: 2,
        gross: 17475,
        commission: 1000,
        laborers_net: 15425,
        laborers_unpaid: 6700,
      },
      pool: {
        pool_total: 662220,
        commission_cash_total: 0,
        absorbed_pre: 655580,
        absorbed_mesthri: 3320,
        future_credit: 3320,
      },
    };

    const ledger = mapCrewLedger(raw) as CrewLedger;
    expect(ledger.enabled).toBe(true);
    expect(ledger.config.mesthriName).toBe("Jithin");
    expect(ledger.config.effectiveFrom).toBe("2026-07-12");
    expect(ledger.weeks).toHaveLength(2);
    expect(ledger.weeks[0].weekStart).toBe("2026-07-12");
    expect(ledger.weeks[0].isPostCutover).toBe(true);
    expect(ledger.weeks[0].rows[1].net).toBe(1500);
    expect(ledger.weeks[0].rows[1].paymentState).toBe("unpaid");
    expect(ledger.weeks[1].isPostCutover).toBe(false);
    expect(ledger.mesthri.poolAbsorbed).toBe(3320);
    expect(ledger.totals.laborersUnpaid).toBe(6700);
    expect(ledger.pool.futureCredit).toBe(3320);
  });
});

describe("computeCrewStripView", () => {
  const mesthri = {
    laborerId: "jithin",
    name: "Jithin",
    ownGross: 6950,
    commissionAccrued: 1825,
    ownPaid: 3320,
    commissionPaid: 0,
    commissionPaidDirect: 0,
    poolAbsorbed: 3320,
    ownRemaining: 3630,
    commissionRemaining: 1825,
    stillToPay: 5455,
  };

  it("leads with still-to-pay and derives paid-of-earned + pct", () => {
    const view = computeCrewStripView(mesthri);
    expect(view.stillToPay).toBe(5455);
    expect(view.totalEarned).toBe(8775);
    expect(view.totalPaid).toBe(3320);
    expect(view.pctPaid).toBe(38);
    expect(view.isSettled).toBe(false);
    expect(view.poolAbsorbed).toBe(3320);
  });

  it("marks settled when the residue is float noise", () => {
    const view = computeCrewStripView({
      ...mesthri,
      ownRemaining: 0.2,
      commissionRemaining: 0.1,
      stillToPay: 0.3,
      ownPaid: 6950,
      commissionPaid: 1825,
    });
    expect(view.isSettled).toBe(true);
    expect(view.pctPaid).toBe(100);
  });

  it("handles the empty contract without dividing by zero", () => {
    const view = computeCrewStripView({
      ...mesthri,
      ownGross: 0,
      commissionAccrued: 0,
      ownPaid: 0,
      commissionPaid: 0,
      ownRemaining: 0,
      commissionRemaining: 0,
      stillToPay: 0,
      poolAbsorbed: 0,
    });
    expect(view.pctPaid).toBe(0);
    expect(view.isSettled).toBe(false);
  });
});

describe("allocatePayAllOwed", () => {
  const weeks = [
    { weekStart: "2026-07-19", unpaid: 900 },
    { weekStart: "2026-07-05", unpaid: 0 },
    { weekStart: "2026-07-12", unpaid: 1500 },
  ];

  it("fills oldest week first and skips settled weeks", () => {
    expect(allocatePayAllOwed(2000, weeks)).toEqual([
      { weekStart: "2026-07-12", amount: 1500 },
      { weekStart: "2026-07-19", amount: 500 },
    ]);
  });

  it("caps at the total owed and drops zero allocations", () => {
    expect(allocatePayAllOwed(5000, weeks)).toEqual([
      { weekStart: "2026-07-12", amount: 1500 },
      { weekStart: "2026-07-19", amount: 900 },
    ]);
    expect(allocatePayAllOwed(0, weeks)).toEqual([]);
  });

  it("rounds paise to 2 decimals without overshooting", () => {
    const result = allocatePayAllOwed(100.555, [{ weekStart: "2026-07-12", unpaid: 1000 }]);
    expect(result).toEqual([{ weekStart: "2026-07-12", amount: 100.55 }]);
  });
});
