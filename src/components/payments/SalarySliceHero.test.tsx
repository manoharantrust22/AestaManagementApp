import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SalarySliceHero } from "./SalarySliceHero";

// MobileCollapsibleHero defaults to collapsed; expand it before each assertion
// by clicking the "Expand summary" toggle button. Labels matching the current
// statusLabel can appear twice (once in the header bar, once inside the KPI
// tile grid), so we use getAllByText for those and assert length >= 1.
function expand() {
  fireEvent.click(screen.getByRole("button", { name: /expand summary/i }));
}

describe("SalarySliceHero", () => {
  const baseSummary = {
    wagesDue: 234400,
    settlementsTotal: 182400,
    advancesTotal: 43400,
    paidToWeeks: 182400,
    futureCredit: 0,
    mestriOwed: 52000,
    weeksCount: 12,
    settlementCount: 8,
    advanceCount: 5,
  };

  beforeEach(() => {
    try {
      window.localStorage.clear();
    } catch {
      // ignore
    }
  });

  it("renders the five KPI labels with Indian-formatted values", () => {
    render(<SalarySliceHero summary={baseSummary} isLoading={false} />);
    expand();
    expect(screen.getByText("Wages Due")).toBeInTheDocument();
    expect(screen.getByText("Applied to weeks")).toBeInTheDocument();
    expect(screen.getByText("Excess Paid")).toBeInTheDocument();
    expect(screen.getByText("Paid Out")).toBeInTheDocument();
    // "Still Owed" appears in both the collapsed header status label AND the tile
    expect(screen.getAllByText("Still Owed").length).toBeGreaterThan(0);
    expect(screen.getByText("₹2,34,400")).toBeInTheDocument();
  });

  it("shows advances as a separate line on the Paid Out tile", () => {
    render(<SalarySliceHero summary={baseSummary} isLoading={false} />);
    expand();
    expect(
      screen.getByText("+ ₹43,400 advances (separate)")
    ).toBeInTheDocument();
  });

  it("renders BOTH Still Owed and Excess Paid when the two coexist", () => {
    // Crew pay makes this the normal case: pool money that can no longer fill a
    // laborer week sits as excess while those laborers are still owed.
    render(
      <SalarySliceHero
        summary={{
          ...baseSummary,
          wagesDue: 680025,
          settlementsTotal: 690470,
          advancesTotal: 0,
          advanceCount: 0,
          paidToWeeks: 676150,
          futureCredit: 14320,
          mestriOwed: 3875,
        }}
        isLoading={false}
      />
    );
    expand();
    expect(screen.getAllByText("Still Owed").length).toBeGreaterThan(0);
    expect(screen.getByText("Excess Paid")).toBeInTheDocument();
    expect(screen.getAllByText("₹3,875").length).toBeGreaterThan(0);
    expect(screen.getAllByText("₹14,320").length).toBeGreaterThan(0);
    // The bridge line — the whole point of the strip.
    expect(
      screen.getByText(/₹6,90,470 paid out = ₹6,76,150 applied to weeks/)
    ).toBeInTheDocument();
  });

  it("shows 'Settled' in the collapsed bar when nothing is owed or unapplied", () => {
    render(
      <SalarySliceHero
        summary={{ ...baseSummary, mestriOwed: 0, futureCredit: 0 }}
        isLoading={false}
      />
    );
    expect(screen.getByText("Settled")).toBeInTheDocument();
    expand();
    // Both zero-state tiles still render, so the row always reconciles.
    expect(screen.getByText("all weeks covered")).toBeInTheDocument();
    expect(screen.getByText("nothing unapplied")).toBeInTheDocument();
  });

  it("renders skeleton placeholders when isLoading", () => {
    // Loading state bypasses MobileCollapsibleHero entirely and renders the
    // skeleton grid inline, so no expand() click is needed.
    render(<SalarySliceHero summary={undefined} isLoading={true} />);
    expect(screen.getAllByTestId("kpi-skeleton")).toHaveLength(5);
  });

  it("renders progress percentage from paidToWeeks/wagesDue", () => {
    render(<SalarySliceHero summary={baseSummary} isLoading={false} />);
    expand();
    // 78% appears in the collapsed header progress bar as well as in the expanded view
    expect(screen.getAllByText("78%").length).toBeGreaterThan(0);
  });
});
