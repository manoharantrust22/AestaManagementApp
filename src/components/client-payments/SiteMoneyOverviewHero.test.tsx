import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material";
import { SiteMoneyOverviewHero } from "./SiteMoneyOverviewHero";
import type { SiteFinancialSummary } from "@/hooks/queries/useSiteFinancialSummary";

const theme = createTheme();

function renderHero(overrides: Partial<SiteFinancialSummary> = {}) {
  const summary: SiteFinancialSummary = {
    baseContract: 5_000_000,
    additionalWorksConfirmed: 600_000,
    totalContract: 5_600_000,
    clientPaid: 3_800_000,
    remainingFromClient: 1_800_000,
    supervisorCost: 350_000,
    netInHand: 3_450_000,
    progressPct: 68,
    ...overrides,
  };
  return render(
    <ThemeProvider theme={theme}>
      <SiteMoneyOverviewHero siteId="site-1" summary={summary} />
    </ThemeProvider>
  );
}

describe("SiteMoneyOverviewHero", () => {
  it("renders all six KPI labels", () => {
    renderHero();
    expect(screen.getByText(/Base Contract/i)).toBeInTheDocument();
    expect(screen.getByText(/^Additional Works$/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Contract/i)).toBeInTheDocument();
    expect(screen.getByText(/Client Paid/i)).toBeInTheDocument();
    // Two "Remaining from Client" matches: hero status bar + the KPI tile
    expect(screen.getAllByText(/Remaining (?:f|F)rom Client/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Net In Hand/i)).toBeInTheDocument();
  });

  it("renders the formatted INR values", () => {
    renderHero();
    expect(screen.getByText("₹50,00,000")).toBeInTheDocument(); // base = 50L
    expect(screen.getByText("₹6,00,000")).toBeInTheDocument();  // extras = 6L
    expect(screen.getByText("₹56,00,000")).toBeInTheDocument(); // total = 56L
    expect(screen.getByText("₹38,00,000")).toBeInTheDocument(); // paid = 38L
    expect(screen.getByText("₹34,50,000")).toBeInTheDocument(); // net = 34.5L
  });

  it("renders the progress percentage", () => {
    renderHero();
    expect(screen.getByText("68%")).toBeInTheDocument();
  });

  it("uses error variant on Net In Hand when negative", () => {
    // Sanity: the negative-net path renders without throwing
    renderHero({ netInHand: -100_000 });
    expect(screen.getByText(/-1,00,000/)).toBeInTheDocument();
  });
});
