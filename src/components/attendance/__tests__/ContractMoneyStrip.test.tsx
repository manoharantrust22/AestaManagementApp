import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ContractMoneyStrip } from "../ContractMoneyStrip";
import type { ContractMoneySummary } from "@/lib/workforce/tradeContractSummary";

const base: ContractMoneySummary = {
  contractId: "c1", title: "Ashish", tradeName: "Painting",
  agreed: 100000, spent: 40000, remaining: 60000, overpaid: false,
  hasAgreedAmount: true, severity: "instep",
};

describe("ContractMoneyStrip", () => {
  it("renders nothing when summary is null", () => {
    const { container } = render(<ContractMoneyStrip summary={null} onOpenContract={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows agreed / spent / left for a healthy contract", () => {
    render(<ContractMoneyStrip summary={base} onOpenContract={vi.fn()} />);
    expect(screen.getByText(/agreed/i)).toBeTruthy();
    expect(screen.getByText(/spent/i)).toBeTruthy();
    expect(screen.getByText(/left/i)).toBeTruthy();
    expect(screen.getByTestId("contract-money-strip-verdict").textContent).toMatch(/in step/i);
  });

  it("shows the daily-wage-only warning with spent-so-far and a Set agreed action", () => {
    const onOpen = vi.fn();
    render(
      <ContractMoneyStrip
        summary={{ ...base, agreed: 0, remaining: 0, hasAgreedAmount: false }}
        onOpenContract={onOpen}
      />
    );
    expect(screen.getByText(/daily-wage only/i)).toBeTruthy();
    expect(screen.getByText(/40,000/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /set agreed/i }));
    expect(onOpen).toHaveBeenCalledWith("c1");
  });

  it("labels an overpaid contract", () => {
    render(
      <ContractMoneyStrip
        summary={{ ...base, spent: 112000, remaining: -12000, overpaid: true, severity: "high" }}
        onOpenContract={vi.fn()}
      />
    );
    expect(screen.getByText(/overpaid/i)).toBeTruthy();
  });
});
