import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import WalletBalancePreview from "./WalletBalancePreview";

describe("WalletBalancePreview", () => {
  it("renders current balance, amount, and after-balance when there is headroom", () => {
    render(
      <WalletBalancePreview
        engineerName="Ajith"
        siteName="Padmavathy"
        currentBalance={10000}
        amount={330}
      />
    );
    expect(screen.getByText(/Your wallet · Padmavathy/i)).toBeInTheDocument();
    expect(screen.getByText("Ajith")).toBeInTheDocument();
    expect(screen.getByText("₹10,000")).toBeInTheDocument();
    expect(screen.getByText("−₹330")).toBeInTheDocument();
    expect(screen.getByText("₹9,670")).toBeInTheDocument();
    expect(screen.queryByText(/Wallet overdraft/i)).not.toBeInTheDocument();
  });

  it("renders overdraft warning when after-balance goes negative", () => {
    render(
      <WalletBalancePreview
        engineerName="Ajith"
        siteName="Srinivasan"
        currentBalance={500}
        amount={1000}
      />
    );
    expect(screen.getByText("−₹500")).toBeInTheDocument();
    expect(screen.getByText(/Wallet overdraft/i)).toBeInTheDocument();
    expect(screen.getByText(/company will owe you ₹500/i)).toBeInTheDocument();
  });

  it("treats a zero-balance + any spend as overdraft", () => {
    render(
      <WalletBalancePreview
        engineerName="Ajith"
        siteName="Test"
        currentBalance={0}
        amount={100}
      />
    );
    expect(screen.getByText(/Wallet overdraft/i)).toBeInTheDocument();
  });

  it("does not render a negative sign on the expense row when amount is zero", () => {
    render(
      <WalletBalancePreview
        engineerName="Ajith"
        siteName="Padmavathy"
        currentBalance={10000}
        amount={0}
      />
    );
    // The expense row should read "₹0", not "−₹0"
    expect(screen.queryByText("−₹0")).not.toBeInTheDocument();
    expect(screen.getAllByText("₹0").length).toBeGreaterThan(0);
  });

  it("renders skeleton when isLoading is true", () => {
    const { container } = render(
      <WalletBalancePreview
        engineerName="Ajith"
        siteName="Padmavathy"
        currentBalance={0}
        amount={0}
        isLoading
      />
    );
    expect(container.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
    expect(screen.queryByText(/Current balance/i)).not.toBeInTheDocument();
  });
});
