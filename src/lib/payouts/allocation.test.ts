import { describe, it, expect } from "vitest";
import { allocateTotal, bucketKey, bucketsHash, compareBuckets } from "./allocation";
import type { PayoutBucket } from "@/types/payout.types";

const bucket = (over: Partial<PayoutBucket>): PayoutBucket => ({
  siteId: "site-a",
  siteName: "Alpha",
  kind: "company_salary",
  refKind: null,
  refId: null,
  title: "Company salary",
  trade: null,
  commissionApplies: null,
  daysWeek: 0,
  grossWeek: 0,
  commissionWeek: 0,
  netWeek: 0,
  thisWeekUnpaid: 0,
  earlierUnpaid: 0,
  totalUnpaid: 0,
  paidTotal: 0,
  ...over,
});

const company = bucket({
  siteId: "site-a",
  siteName: "Alpha",
  thisWeekUnpaid: 1000,
  earlierUnpaid: 200,
  totalUnpaid: 1200,
});

const contractB = bucket({
  siteId: "site-b",
  siteName: "Beta",
  kind: "contract",
  refKind: "task_work",
  refId: "tw-1",
  title: "WaterTank",
  thisWeekUnpaid: 5625,
  earlierUnpaid: 3375,
  totalUnpaid: 9000,
});

const contractA = bucket({
  siteId: "site-a",
  siteName: "Alpha",
  kind: "contract",
  refKind: "subcontract",
  refId: "sc-1",
  title: "Civil works",
  thisWeekUnpaid: 500,
  earlierUnpaid: 0,
  totalUnpaid: 500,
});

const byKey = (allocs: ReturnType<typeof allocateTotal>) =>
  Object.fromEntries(allocs.map((a) => [a.key, a.amount]));

describe("compareBuckets", () => {
  it("puts company salary first, then contracts by site/title", () => {
    const sorted = [contractB, contractA, company].sort(compareBuckets);
    expect(sorted.map((b) => b.title)).toEqual(["Company salary", "Civil works", "WaterTank"]);
  });
});

describe("allocateTotal", () => {
  it("full total fills every bucket completely", () => {
    const allocs = allocateTotal([company, contractA, contractB], 1200 + 500 + 9000);
    const m = byKey(allocs);
    expect(m[bucketKey(company)]).toBe(1200);
    expect(m[bucketKey(contractA)]).toBe(500);
    expect(m[bucketKey(contractB)]).toBe(9000);
  });

  it("clamps a total above the grand unpaid", () => {
    const allocs = allocateTotal([company, contractA], 99999);
    const m = byKey(allocs);
    expect(m[bucketKey(company)]).toBe(1200);
    expect(m[bucketKey(contractA)]).toBe(500);
  });

  it("fills arrears first (company before contracts), then this week", () => {
    // arrears: company 200, contractB 3375 -> total arrears 3575
    const allocs = allocateTotal([company, contractA, contractB], 300);
    const m = byKey(allocs);
    expect(m[bucketKey(company)]).toBe(200); // company arrears first
    expect(m[bucketKey(contractB)]).toBe(100); // then contract arrears
    expect(m[bucketKey(contractA)]).toBe(0); // this-week untouched
  });

  it("moves into this-week tier after arrears are exhausted", () => {
    const allocs = allocateTotal([company, contractA, contractB], 3575 + 1000 + 250);
    const m = byKey(allocs);
    expect(m[bucketKey(company)]).toBe(200 + 1000); // arrears + full this-week
    expect(m[bucketKey(contractB)]).toBe(3375); // arrears only
    expect(m[bucketKey(contractA)]).toBe(250); // partial this-week (Alpha before Beta)
  });

  it("handles paise precision without drift", () => {
    const a = bucket({ siteId: "s1", siteName: "A", thisWeekUnpaid: 397.86 });
    const b = bucket({ siteId: "s2", siteName: "B", thisWeekUnpaid: 303.14 });
    const allocs = allocateTotal([a, b], 701);
    const m = byKey(allocs);
    expect(m[bucketKey(a)]).toBe(397.86);
    expect(m[bucketKey(b)]).toBe(303.14);
    expect(allocs.reduce((s, x) => s + x.amount, 0)).toBeCloseTo(701, 2);
  });

  it("returns zero allocations for zero/negative totals", () => {
    const allocs = allocateTotal([company, contractA], 0);
    expect(allocs.every((a) => a.amount === 0)).toBe(true);
  });
});

describe("bucketsHash", () => {
  it("is order-independent and paise-stable", () => {
    const h1 = bucketsHash([
      { key: "x", amount: 10.5 },
      { key: "a", amount: 0.1 },
    ]);
    const h2 = bucketsHash([
      { key: "a", amount: 0.1 },
      { key: "x", amount: 10.5 },
    ]);
    expect(h1).toBe(h2);
    expect(h1).toBe("a=10;x=1050");
  });

  it("drops zero allocations", () => {
    expect(bucketsHash([{ key: "a", amount: 0 }])).toBe("");
  });
});
