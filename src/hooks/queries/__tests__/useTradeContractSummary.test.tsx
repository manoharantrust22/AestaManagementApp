import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("@/hooks/queries/useTrades", () => ({ useSiteTrades: vi.fn() }));
vi.mock("@/hooks/queries/useTradeReconciliations", () => ({ useSiteTradeReconciliations: vi.fn() }));

import { useSiteTrades } from "@/hooks/queries/useTrades";
import { useSiteTradeReconciliations } from "@/hooks/queries/useTradeReconciliations";
import { useTradeContractSummaries } from "../useTradeContractSummary";
import type { Trade } from "@/types/trade.types";

const trade = (id: string, name: string, totalValue: number): Trade => ({
  category: { id, name, isSystemSeed: true, isActive: true, hasWorkspace: true },
  contracts: [
    {
      id: `${id}-c`, siteId: "s1", tradeCategoryId: id, stageId: null, title: name,
      laborTrackingMode: "detailed", isInHouse: false, contractType: "specialist",
      status: "active", totalValue, workProgressPercent: null, teamId: null,
      laborerId: null, mesthriOrSpecialistName: name, parentSubcontractId: null, createdAt: "",
    },
  ],
});

describe("useTradeContractSummaries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("assembles summaries from the two source hooks", () => {
    vi.mocked(useSiteTrades).mockReturnValue({
      data: [trade("paint", "Painting", 0), trade("civ", "Civil", 800000)],
      isLoading: false,
    } as any);
    vi.mocked(useSiteTradeReconciliations).mockReturnValue({
      data: new Map([
        [
          "civ-c",
          {
            subcontractId: "civ-c", quotedAmount: 800000, amountPaid: 0,
            amountPaidSubcontractPayments: 0, amountPaidSettlements: 0,
            impliedLaborValueDetailed: 0, impliedLaborValueHeadcount: 0,
          },
        ],
      ]),
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useTradeContractSummaries("s1"));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.noAgreedAmountCategoryIds.has("paint")).toBe(true);
    expect(result.current.byCategoryId.get("civ")?.agreed).toBe(800000);
  });

  it("reports loading while either source hook is loading", () => {
    vi.mocked(useSiteTrades).mockReturnValue({ data: undefined, isLoading: true } as any);
    vi.mocked(useSiteTradeReconciliations).mockReturnValue({ data: undefined, isLoading: false } as any);
    const { result } = renderHook(() => useTradeContractSummaries("s1"));
    expect(result.current.isLoading).toBe(true);
  });
});
