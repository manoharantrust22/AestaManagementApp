import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock Supabase client used inside ExpandableContractRow's hooks so tests
// don't require env vars and don't make real network calls.
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              order: () => Promise.resolve({ data: [], error: null }),
            }),
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
  }),
}));

import { TradeCard } from "./TradeCard";
import type { Trade, TradeCategory } from "@/types/trade.types";

const baseCat: TradeCategory = {
  id: "p1",
  name: "Painting",
  isSystemSeed: true,
  isActive: true,
};

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    category: baseCat,
    contracts: [],
    ...overrides,
  };
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("TradeCard", () => {
  it("shows trade name", () => {
    renderWithClient(
      <TradeCard trade={makeTrade()} onAddClick={() => {}} />
    );
    expect(screen.getByText("Painting")).toBeInTheDocument();
  });

  it("shows 'Add contract' CTA when no contracts and fires onAddClick", () => {
    const onAddClick = vi.fn();
    renderWithClient(
      <TradeCard trade={makeTrade()} onAddClick={onAddClick} />
    );
    fireEvent.click(screen.getByRole("button", { name: /add contract/i }));
    expect(onAddClick).toHaveBeenCalledWith("p1");
  });

  it("renders the active contract's mesthri name + quoted total", () => {
    const trade = makeTrade({
      contracts: [
        {
          id: "k1",
          siteId: "s1",
          tradeCategoryId: "p1",
          title: "Asis Painting",
          laborTrackingMode: "mesthri_only",
          isInHouse: false,
          contractType: "mesthri",
          status: "active",
          totalValue: 250000,
          mesthriOrSpecialistName: "Asis Mesthri",
          createdAt: "2026-05-02T00:00:00Z",
        },
      ],
    });
    renderWithClient(
      <TradeCard trade={trade} onAddClick={() => {}} />
    );
    expect(screen.getByText("Asis Mesthri")).toBeInTheDocument();
    expect(screen.getAllByText(/2,50,000/).length).toBeGreaterThan(0);
  });

  it("shows Paid and Balance from reconciliation map", () => {
    const trade = makeTrade({
      contracts: [
        {
          id: "k1",
          siteId: "s1",
          tradeCategoryId: "p1",
          title: "Asis Painting",
          laborTrackingMode: "mesthri_only",
          isInHouse: false,
          contractType: "mesthri",
          status: "active",
          totalValue: 200000,
          mesthriOrSpecialistName: "Asis Mesthri",
          createdAt: "2026-05-02T00:00:00Z",
        },
      ],
    });
    const reconciliations = new Map([
      [
        "k1",
        {
          subcontractId: "k1",
          quotedAmount: 200000,
          amountPaid: 50000,
          amountPaidSubcontractPayments: 50000,
          amountPaidSettlements: 0,
          impliedLaborValueDetailed: 0,
          impliedLaborValueHeadcount: 0,
        },
      ],
    ]);
    renderWithClient(
      <TradeCard
        trade={trade}
        reconciliations={reconciliations}
        onAddClick={() => {}}
      />
    );
    // Both 50,000 and 1,50,000 contain "50,000"
    expect(screen.getAllByText(/50,000/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/1,50,000/)).toBeInTheDocument();
  });

  it("toggles expand when a contract row is clicked", () => {
    const onContractClick = vi.fn();
    const trade = makeTrade({
      contracts: [
        {
          id: "k1",
          siteId: "s1",
          tradeCategoryId: "p1",
          title: "Asis Painting",
          laborTrackingMode: "mesthri_only",
          isInHouse: false,
          contractType: "mesthri",
          status: "active",
          totalValue: 250000,
          mesthriOrSpecialistName: "Asis Mesthri",
          createdAt: "2026-05-02T00:00:00Z",
        },
      ],
    });
    renderWithClient(
      <TradeCard
        trade={trade}
        onContractClick={onContractClick}
        onAddClick={() => {}}
      />
    );
    fireEvent.click(screen.getByText(/asis mesthri/i));
    expect(onContractClick).toHaveBeenCalledWith("k1");
  });

  it("labels in-house Civil contracts as 'In-house' rather than a mesthri name", () => {
    const trade = makeTrade({
      category: {
        id: "c1",
        name: "Civil",
        isSystemSeed: true,
        isActive: true,
      },
      contracts: [
        {
          id: "k0",
          siteId: "s1",
          tradeCategoryId: "c1",
          title: "Civil — In-house",
          laborTrackingMode: "detailed",
          isInHouse: true,
          contractType: "mesthri",
          status: "active",
          totalValue: 0,
          mesthriOrSpecialistName: null,
          createdAt: "2026-05-02T00:00:00Z",
        },
      ],
    });
    renderWithClient(
      <TradeCard trade={trade} onAddClick={() => {}} />
    );
    expect(screen.getByText(/in-house/i)).toBeInTheDocument();
  });
});
