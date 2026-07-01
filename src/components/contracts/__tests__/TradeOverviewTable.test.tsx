import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TradeOverviewTable } from "../TradeOverviewTable";
import type { OverviewRow, OverviewTotals } from "@/lib/workforce/tradeOverview";

const rows: OverviewRow[] = [
  { siteId: "s2", siteName: "Padmavati", tradeCategoryId: "e", tradeName: "Electrical", agreed: 0, spent: 0, remaining: 0, contractCount: 0, tier: "no_contract" },
  { siteId: "s1", siteName: "Srinivasan", tradeCategoryId: "v", tradeName: "Civil", agreed: 800000, spent: 500000, remaining: 300000, contractCount: 3, tier: "healthy" },
];
const totals: OverviewTotals = { agreed: 800000, spent: 500000, remaining: 300000, blindCount: 1 };

describe("TradeOverviewTable", () => {
  it("renders a row per entry with site + trade and fires onOpenRow", () => {
    const onOpen = vi.fn();
    render(<TradeOverviewTable rows={rows} totals={totals} onOpenRow={onOpen} />);
    expect(screen.getByText("Electrical")).toBeTruthy();
    expect(screen.getByText("Civil")).toBeTruthy();
    expect(screen.getByText(/NO CONTRACT/i)).toBeTruthy();
    fireEvent.click(screen.getByText("Civil"));
    expect(onOpen).toHaveBeenCalledWith(rows[1]);
  });

  it("shows the totals row with blind count", () => {
    render(<TradeOverviewTable rows={rows} totals={totals} onOpenRow={vi.fn()} />);
    expect(screen.getByText(/1 running blind/i)).toBeTruthy();
  });

  it("renders an empty state when there are no rows", () => {
    render(<TradeOverviewTable rows={[]} totals={{ agreed: 0, spent: 0, remaining: 0, blindCount: 0 }} onOpenRow={vi.fn()} />);
    expect(screen.getByText(/no trades/i)).toBeTruthy();
  });
});
