import { describe, expect, it } from "vitest";
import { formatWeekRange, groupRowsByWeek, type WeeklyLedgerRow } from "./ledgerWeeks";

const row = (over: Partial<WeeklyLedgerRow>): WeeklyLedgerRow => ({
  weekStart: "2026-06-28", laborerId: "l1", laborerName: "Hemanta", roleName: "Male Helper",
  manDays: 4.5, dayCount: 5, gross: 3600, commission: 0, net: 3600,
  netTotal: 10125, netPaid: 5200, netUnpaid: 4925, isMesthri: false, ...over,
});

describe("formatWeekRange", () => {
  it("labels a Sunday-start week through its Saturday", () => {
    expect(formatWeekRange("2026-06-28")).toBe("Sun 28 Jun – Sat 4 Jul");
  });

  it("labels a week that stays inside one month", () => {
    expect(formatWeekRange("2026-06-07")).toBe("Sun 7 Jun – Sat 13 Jun");
  });
});

describe("groupRowsByWeek", () => {
  it("returns weeks newest-first", () => {
    const out = groupRowsByWeek([
      row({ weekStart: "2026-06-14" }),
      row({ weekStart: "2026-06-28" }),
      row({ weekStart: "2026-06-21" }),
    ]);
    expect(out.map((w) => w.weekStart)).toEqual(["2026-06-28", "2026-06-21", "2026-06-14"]);
  });

  it("totals each week's earnings from that week's rows only", () => {
    const out = groupRowsByWeek([
      row({ weekStart: "2026-06-28", laborerId: "a", net: 3600 }),
      row({ weekStart: "2026-06-28", laborerId: "b", net: 2850 }),
      row({ weekStart: "2026-06-21", laborerId: "a", net: 9999 }),
    ]);
    expect(out[0].totalNet).toBe(6450);
    expect(out[1].totalNet).toBe(9999);
  });

  it("puts the mesthri first within a week, then by earnings", () => {
    const out = groupRowsByWeek([
      row({ laborerId: "a", laborerName: "Hemanta", net: 3600 }),
      row({ laborerId: "m", laborerName: "Jithin", net: 100, isMesthri: true }),
      row({ laborerId: "b", laborerName: "Sadha", net: 5000 }),
    ]);
    expect(out[0].rows.map((r) => r.laborerName)).toEqual(["Jithin", "Sadha", "Hemanta"]);
  });

  it("carries a human label for each week", () => {
    expect(groupRowsByWeek([row({ weekStart: "2026-06-28" })])[0].label)
      .toBe("Sun 28 Jun – Sat 4 Jul");
  });

  it("returns no weeks for no rows", () => {
    expect(groupRowsByWeek([])).toEqual([]);
  });
});
