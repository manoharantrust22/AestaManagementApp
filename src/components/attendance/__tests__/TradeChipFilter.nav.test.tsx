import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock useSiteTrades before importing the component
vi.mock("@/hooks/queries/useTrades", () => ({
  useSiteTrades: vi.fn(),
}));

// Mock getTradeColor to return a stable object (avoids CSS-in-JS side-effects)
vi.mock("@/theme/tradeColors", () => ({
  getTradeColor: () => ({
    main: "#1976d2",
    dark: "#115293",
    light: "#42a5f5",
    contrastText: "#fff",
  }),
}));

import { useSiteTrades } from "@/hooks/queries/useTrades";
import { TradeChipFilter } from "../TradeChipFilter";
import type { Trade } from "@/types/trade.types";

// ── Minimal fixture data ──────────────────────────────────────────────────────
const SAMPLE_TRADES: Trade[] = [
  {
    category: {
      id: "civ",
      name: "Civil",
      isSystemSeed: true,
      isActive: true,
      hasWorkspace: true,
    },
    contracts: [
      {
        id: "civ-c",
        siteId: "s1",
        tradeCategoryId: "civ",
        stageId: null,
        title: "Civil In-house",
        laborTrackingMode: "detailed",
        isInHouse: true,
        contractType: "mesthri",
        status: "active",
        totalValue: 0,
        workProgressPercent: null,
        teamId: null,
        laborerId: null,
        mesthriOrSpecialistName: null,
        parentSubcontractId: null,
        createdAt: "",
      },
    ],
  },
  {
    category: {
      id: "t1",
      name: "Painting",
      isSystemSeed: false,
      isActive: true,
      hasWorkspace: true,
    },
    contracts: [
      {
        id: "paint-c",
        siteId: "s1",
        tradeCategoryId: "t1",
        stageId: null,
        title: "Painting In-house",
        laborTrackingMode: "detailed",
        isInHouse: true,
        contractType: "mesthri",
        status: "active",
        totalValue: 0,
        workProgressPercent: null,
        teamId: null,
        laborerId: null,
        mesthriOrSpecialistName: null,
        parentSubcontractId: null,
        createdAt: "",
      },
    ],
  },
];

// ── Helper ────────────────────────────────────────────────────────────────────
function setupMock() {
  vi.mocked(useSiteTrades).mockReturnValue({
    data: SAMPLE_TRADES,
    isLoading: false,
  } as any);
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("TradeChipFilter — onNavigateScope prop", () => {
  it("calls onNavigateScope with paint-c and does NOT call onChange(kind:trade) when Painting chip is clicked", () => {
    setupMock();
    const onChange = vi.fn();
    const onNav = vi.fn();

    render(
      <TradeChipFilter
        siteId="s1"
        selected={{ kind: "civil" }}
        onChange={onChange}
        onNavigateScope={onNav}
      />
    );

    // Find and click the Painting chip
    const paintingChip = screen.getByTestId("trade-chip-painting");
    fireEvent.click(paintingChip);

    // Navigation callback should have been called with the contract id
    expect(onNav).toHaveBeenCalledTimes(1);
    expect(onNav).toHaveBeenCalledWith("paint-c");

    // onChange should NOT have been called with kind:"trade"
    const tradeCalls = onChange.mock.calls.filter(
      ([sel]) => sel?.kind === "trade"
    );
    expect(tradeCalls).toHaveLength(0);
  });

  it("calls onNavigateScope(null) and does NOT call onChange when Civil chip is clicked (nav mode)", () => {
    setupMock();
    const onChange = vi.fn();
    const onNav = vi.fn();

    render(
      <TradeChipFilter
        siteId="s1"
        selected={{ kind: "civil" }}
        onChange={onChange}
        onNavigateScope={onNav}
      />
    );

    const civilChip = screen.getByTestId("trade-chip-civil");
    fireEvent.click(civilChip);

    // Civil clears the ?contractId= scope by navigating to the base path.
    expect(onNav).toHaveBeenCalledTimes(1);
    expect(onNav).toHaveBeenCalledWith(null);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("fallback: without onNavigateScope, clicking Painting calls onChange(kind:trade)", () => {
    setupMock();
    const onChange = vi.fn();

    render(
      <TradeChipFilter
        siteId="s1"
        selected={{ kind: "civil" }}
        onChange={onChange}
        // no onNavigateScope — /site/expenses usage
      />
    );

    const paintingChip = screen.getByTestId("trade-chip-painting");
    fireEvent.click(paintingChip);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      kind: "trade",
      categoryId: "t1",
      tradeName: "Painting",
      contractId: "paint-c",
    });
  });

  it("fallback: without onNavigateScope, clicking Civil calls onChange({kind:'civil'})", () => {
    setupMock();
    const onChange = vi.fn();

    render(
      <TradeChipFilter
        siteId="s1"
        selected={{ kind: "civil" }}
        onChange={onChange}
        // no onNavigateScope — /site/expenses usage
      />
    );

    const civilChip = screen.getByTestId("trade-chip-civil");
    fireEvent.click(civilChip);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ kind: "civil" });
  });
});
