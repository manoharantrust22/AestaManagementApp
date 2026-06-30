import { describe, it, expect } from "vitest";
import { buildTradeOverview, tierForSummary } from "../tradeOverview";
import type { TradeMoneySummary } from "../tradeContractSummary";

const s = (
  over: Partial<TradeMoneySummary> & { tradeCategoryId: string; tradeName: string }
): TradeMoneySummary => ({
  hasDetailedContract: true,
  hasAgreedAmount: true,
  agreed: 0,
  spent: 0,
  remaining: 0,
  severity: "instep",
  contractCount: 1,
  ...over,
});

describe("tierForSummary", () => {
  it("no contract when contractCount is 0", () => {
    expect(
      tierForSummary(s({ tradeCategoryId: "e", tradeName: "Electrical", contractCount: 0, hasAgreedAmount: false }))
    ).toBe("no_contract");
  });
  it("blind when has contract but no agreed amount", () => {
    expect(
      tierForSummary(s({ tradeCategoryId: "p", tradeName: "Painting", hasAgreedAmount: false, agreed: 0 }))
    ).toBe("blind");
  });
  it("overpaid when spent exceeds agreed", () => {
    expect(
      tierForSummary(s({ tradeCategoryId: "c", tradeName: "Carpenter", agreed: 100, spent: 120, remaining: -20 }))
    ).toBe("overpaid");
  });
  it("healthy otherwise", () => {
    expect(
      tierForSummary(s({ tradeCategoryId: "v", tradeName: "Civil", agreed: 100, spent: 40, remaining: 60 }))
    ).toBe("healthy");
  });
});

describe("buildTradeOverview", () => {
  it("flattens, sorts attention-first, and totals", () => {
    const { rows, totals } = buildTradeOverview([
      {
        siteId: "s1",
        siteName: "Srinivasan",
        summaries: [
          s({ tradeCategoryId: "v", tradeName: "Civil", agreed: 800000, spent: 500000, remaining: 300000 }), // healthy
          s({ tradeCategoryId: "p", tradeName: "Painting", hasAgreedAmount: false, agreed: 0, spent: 38000 }), // blind
        ],
      },
      {
        siteId: "s2",
        siteName: "Padmavati",
        summaries: [
          s({ tradeCategoryId: "e", tradeName: "Electrical", contractCount: 0, hasAgreedAmount: false }), // no_contract
          s({ tradeCategoryId: "c", tradeName: "Carpenter", agreed: 100000, spent: 112000, remaining: -12000 }), // overpaid
        ],
      },
    ]);
    expect(rows.map((r) => r.tier)).toEqual(["no_contract", "blind", "overpaid", "healthy"]);
    expect(rows[0].tradeName).toBe("Electrical");
    expect(totals.agreed).toBe(900000);
    expect(totals.spent).toBe(650000);
    expect(totals.remaining).toBe(288000);
    expect(totals.blindCount).toBe(2);
  });
});
