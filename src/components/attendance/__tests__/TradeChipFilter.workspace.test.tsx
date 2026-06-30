import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock useSiteTrades before importing the component
vi.mock("@/hooks/queries/useTrades", () => ({
  useSiteTrades: vi.fn(),
}));

// Stable colour object — avoids CSS-in-JS side effects in the test.
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
import type { Trade, TradeContract, TradeCategory } from "@/types/trade.types";

// ── Fixture builders ──────────────────────────────────────────────────────────
function detailedContract(id: string, categoryId: string): TradeContract {
  return {
    id,
    siteId: "s1",
    tradeCategoryId: categoryId,
    stageId: null,
    title: `${categoryId} In-house`,
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
  };
}

function trade(category: Partial<TradeCategory> & { id: string; name: string }, contracts: TradeContract[]): Trade {
  return {
    category: {
      isSystemSeed: false,
      isActive: true,
      hasWorkspace: true,
      ...category,
    },
    contracts,
  };
}

function mockTrades(trades: Trade[]) {
  vi.mocked(useSiteTrades).mockReturnValue({ data: trades, isLoading: false } as any);
}

describe("TradeChipFilter — Workspace toggle (has_workspace) gating", () => {
  beforeEach(() => vi.clearAllMocks());

  it("HIDES a non-Civil trade whose workspace is OFF even when it has a detailed contract", () => {
    // Mirrors the Padmavathy bug: Electrical is 'ladder only' (workspace OFF)
    // but holds a detailed contract, so it was wrongly showing as a chip.
    mockTrades([
      trade({ id: "civ", name: "Civil", hasWorkspace: true }, [detailedContract("civ-c", "civ")]),
      trade({ id: "elec", name: "Electrical", hasWorkspace: false }, [detailedContract("elec-c", "elec")]),
      trade({ id: "plumb", name: "Plumbing", hasWorkspace: true }, [detailedContract("plumb-c", "plumb")]),
    ]);

    render(
      <TradeChipFilter
        siteId="s1"
        selected={{ kind: "civil" }}
        onChange={vi.fn()}
        onNavigateScope={vi.fn()}
      />
    );

    // Civil and the workspace-ON trade appear…
    expect(screen.getByTestId("trade-chip-civil")).toBeTruthy();
    expect(screen.getByTestId("trade-chip-plumbing")).toBeTruthy();
    // …but the workspace-OFF (ladder-only) trade must NOT.
    expect(screen.queryByTestId("trade-chip-electrical")).toBeNull();
  });

  it("treats hasWorkspace=undefined as ON (back-compat for older rows/tests)", () => {
    mockTrades([
      trade({ id: "civ", name: "Civil", hasWorkspace: true }, [detailedContract("civ-c", "civ")]),
      trade({ id: "paint", name: "Painting", hasWorkspace: undefined }, [detailedContract("paint-c", "paint")]),
    ]);

    render(
      <TradeChipFilter
        siteId="s1"
        selected={{ kind: "civil" }}
        onChange={vi.fn()}
        onNavigateScope={vi.fn()}
      />
    );

    expect(screen.getByTestId("trade-chip-painting")).toBeTruthy();
  });

  it("shows an amber 'no agreed amount' dot only for trades in noAgreedAmountCategoryIds", () => {
    mockTrades([
      trade({ id: "civ", name: "Civil", hasWorkspace: true }, [detailedContract("civ-c", "civ")]),
      trade({ id: "paint", name: "Painting", hasWorkspace: true }, [detailedContract("paint-c", "paint")]),
    ]);

    render(
      <TradeChipFilter
        siteId="s1"
        selected={{ kind: "civil" }}
        onChange={vi.fn()}
        onNavigateScope={vi.fn()}
        noAgreedAmountCategoryIds={new Set(["paint"])}
      />
    );

    expect(screen.getByTestId("trade-chip-noamount-painting")).toBeTruthy();
    expect(screen.queryByTestId("trade-chip-noamount-civil")).toBeNull();
  });

  it("self-hides the whole row when the only non-Civil trade has its workspace OFF", () => {
    mockTrades([
      trade({ id: "civ", name: "Civil", hasWorkspace: true }, [detailedContract("civ-c", "civ")]),
      trade({ id: "elec", name: "Electrical", hasWorkspace: false }, [detailedContract("elec-c", "elec")]),
    ]);

    const { container } = render(
      <TradeChipFilter
        siteId="s1"
        selected={{ kind: "civil" }}
        onChange={vi.fn()}
        onNavigateScope={vi.fn()}
      />
    );

    // No non-Civil workspace trade qualifies → the component renders nothing.
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("trade-chip-civil")).toBeNull();
  });
});
