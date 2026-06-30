import { describe, it, expect } from "vitest";
import {
  buildContractMoneySummary,
  buildTradeMoneySummary,
  assembleSummaries,
} from "../tradeContractSummary";
import type { Trade, TradeContract, ContractReconciliation } from "@/types/trade.types";

function contract(over: Partial<TradeContract> & { id: string }): TradeContract {
  return {
    siteId: "s1",
    tradeCategoryId: "cat",
    stageId: null,
    title: "Ashish",
    laborTrackingMode: "detailed",
    isInHouse: false,
    contractType: "specialist",
    status: "active",
    totalValue: 0,
    workProgressPercent: null,
    teamId: null,
    laborerId: null,
    mesthriOrSpecialistName: "Ashish",
    parentSubcontractId: null,
    createdAt: "",
    ...over,
  };
}
const recon = (
  over: Partial<ContractReconciliation> & { subcontractId: string }
): ContractReconciliation => ({
  quotedAmount: 0,
  amountPaid: 0,
  amountPaidSubcontractPayments: 0,
  amountPaidSettlements: 0,
  impliedLaborValueDetailed: 0,
  impliedLaborValueHeadcount: 0,
  ...over,
});

describe("buildContractMoneySummary", () => {
  it("flags ₹0 agreed as daily-wage-only but still reports spent", () => {
    const s = buildContractMoneySummary(
      contract({ id: "c1", totalValue: 0 }),
      "Painting",
      recon({ subcontractId: "c1", quotedAmount: 0, amountPaid: 40000 })
    );
    expect(s.hasAgreedAmount).toBe(false);
    expect(s.agreed).toBe(0);
    expect(s.spent).toBe(40000);
    expect(s.overpaid).toBe(false);
  });

  it("reports agreed/spent/remaining for a healthy contract", () => {
    const s = buildContractMoneySummary(
      contract({ id: "c1" }),
      "Painting",
      recon({ subcontractId: "c1", quotedAmount: 100000, amountPaid: 40000 })
    );
    expect(s.hasAgreedAmount).toBe(true);
    expect(s.agreed).toBe(100000);
    expect(s.spent).toBe(40000);
    expect(s.remaining).toBe(60000);
    expect(s.overpaid).toBe(false);
  });

  it("marks overpaid when spent exceeds agreed", () => {
    const s = buildContractMoneySummary(
      contract({ id: "c1" }),
      "Painting",
      recon({ subcontractId: "c1", quotedAmount: 100000, amountPaid: 112000 })
    );
    expect(s.remaining).toBe(-12000);
    expect(s.overpaid).toBe(true);
  });

  it("falls back to totalValue when no reconciliation row exists", () => {
    const s = buildContractMoneySummary(contract({ id: "c1", totalValue: 200000 }), "Painting");
    expect(s.agreed).toBe(200000);
    expect(s.spent).toBe(0);
    expect(s.hasAgreedAmount).toBe(true);
  });
});

describe("buildTradeMoneySummary", () => {
  it("sums agreed/spent across the trade's contracts and detects a detailed contract", () => {
    const trade: Trade = {
      category: { id: "cat", name: "Civil", isSystemSeed: true, isActive: true, hasWorkspace: true },
      contracts: [
        contract({ id: "a", laborTrackingMode: "detailed", totalValue: 500000 }),
        contract({ id: "b", laborTrackingMode: "mesthri_only", totalValue: 300000 }),
      ],
    };
    const map = new Map<string, ContractReconciliation>([
      ["a", recon({ subcontractId: "a", quotedAmount: 500000, amountPaid: 100000 })],
      ["b", recon({ subcontractId: "b", quotedAmount: 300000, amountPaid: 50000 })],
    ]);
    const s = buildTradeMoneySummary(trade, map);
    expect(s.agreed).toBe(800000);
    expect(s.spent).toBe(150000);
    expect(s.remaining).toBe(650000);
    expect(s.hasDetailedContract).toBe(true);
    expect(s.hasAgreedAmount).toBe(true);
    expect(s.contractCount).toBe(2);
  });
});

describe("assembleSummaries", () => {
  it("collects category ids with a contract but ₹0 agreed into noAgreedAmountCategoryIds", () => {
    const trades: Trade[] = [
      {
        category: { id: "paint", name: "Painting", isSystemSeed: true, isActive: true, hasWorkspace: true },
        contracts: [contract({ id: "p1", tradeCategoryId: "paint", totalValue: 0 })],
      },
      {
        category: { id: "civ", name: "Civil", isSystemSeed: true, isActive: true, hasWorkspace: true },
        contracts: [contract({ id: "c1", tradeCategoryId: "civ", totalValue: 800000 })],
      },
    ];
    const map = new Map<string, ContractReconciliation>([
      ["c1", recon({ subcontractId: "c1", quotedAmount: 800000, amountPaid: 0 })],
    ]);
    const a = assembleSummaries(trades, map);
    expect(a.noAgreedAmountCategoryIds.has("paint")).toBe(true);
    expect(a.noAgreedAmountCategoryIds.has("civ")).toBe(false);
    expect(a.byContractId.get("p1")?.hasAgreedAmount).toBe(false);
    expect(a.byCategoryId.get("civ")?.agreed).toBe(800000);
  });

  it("returns empty structures for undefined input", () => {
    const a = assembleSummaries(undefined, undefined);
    expect(a.byCategoryId.size).toBe(0);
    expect(a.byContractId.size).toBe(0);
    expect(a.noAgreedAmountCategoryIds.size).toBe(0);
  });
});
