import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SettleViaWalletDialog from "./SettleViaWalletDialog";

vi.mock("@/hooks/queries/useEngineerWalletV2", () => ({
  useEngineerWalletBalance: vi.fn(),
  useLatestDepositSource: vi.fn(),
  broadcastWalletChange: vi.fn(),
}));
vi.mock("@/hooks/queries/usePayerSources", () => ({
  usePayerSources: vi.fn(),
}));
vi.mock("@/contexts/ToastContext", () => ({
  useToast: vi.fn(() => ({
    showToast: vi.fn(),
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showWarning: vi.fn(),
    showInfo: vi.fn(),
  })),
}));
// SubcontractLinkSelector pulls from SiteContext + supabase; stub it out so
// the dialog tests focus on wallet/payer behavior. The Phase 2 caller migration
// (contract week) will get its own integration coverage.
vi.mock("./SubcontractLinkSelector", () => ({
  default: () => null,
}));

import {
  useEngineerWalletBalance,
  useLatestDepositSource,
  broadcastWalletChange,
} from "@/hooks/queries/useEngineerWalletV2";
import { usePayerSources } from "@/hooks/queries/usePayerSources";

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  onSuccess: vi.fn(),
  siteId: "site-1",
  engineerId: "eng-1",
  amount: 800,
  summary: "09 May · 1 lab",
  onConfirm: vi.fn().mockResolvedValue(undefined),
};

describe("SettleViaWalletDialog", () => {
  beforeEach(() => {
    vi.mocked(useEngineerWalletBalance).mockReturnValue({
      data: { balance: 5000 },
      isLoading: false,
    } as any);
    vi.mocked(useLatestDepositSource).mockReturnValue({
      data: { payer_source: "amma_money", transaction_date: "2026-05-01" },
      isLoading: false,
    } as any);
    vi.mocked(usePayerSources).mockReturnValue({
      data: [
        { key: "amma_money", label: "Amma Money", icon: "Person", requires_name: false },
      ],
      isLoading: false,
    } as any);
    vi.mocked(broadcastWalletChange).mockClear();
    defaultProps.onConfirm.mockClear();
    defaultProps.onSuccess.mockClear();
  });

  it("shows pending amount and wallet balance", () => {
    render(<SettleViaWalletDialog {...defaultProps} />);
    expect(screen.getByText("₹800")).toBeInTheDocument();
    expect(screen.getByText(/5,000/)).toBeInTheDocument();
  });

  it("shows LIFO payer source label by default", () => {
    render(<SettleViaWalletDialog {...defaultProps} />);
    expect(screen.getByText(/Amma Money/i)).toBeInTheDocument();
  });

  it("disables Confirm when balance < pending amount", () => {
    vi.mocked(useEngineerWalletBalance).mockReturnValue({
      data: { balance: 500 },
      isLoading: false,
    } as any);
    render(<SettleViaWalletDialog {...defaultProps} />);
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
  });

  it("shows insufficient balance message when balance < amount", () => {
    vi.mocked(useEngineerWalletBalance).mockReturnValue({
      data: { balance: 500 },
      isLoading: false,
    } as any);
    render(<SettleViaWalletDialog {...defaultProps} />);
    expect(screen.getByText(/insufficient wallet balance/i)).toBeInTheDocument();
  });

  it("shows no-deposit warning when LIFO source is null", () => {
    vi.mocked(useLatestDepositSource).mockReturnValue({
      data: { payer_source: null, transaction_date: null },
      isLoading: false,
    } as any);
    render(<SettleViaWalletDialog {...defaultProps} />);
    expect(screen.getByText(/no wallet deposit found/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
  });

  it("calls onConfirm with LIFO payerSource and the amount when Confirm clicked", async () => {
    render(<SettleViaWalletDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() => {
      expect(defaultProps.onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 800,
          payerSource: "amma_money",
          engineerId: "eng-1",
          siteId: "site-1",
        })
      );
    });
  });

  it("fires broadcastWalletChange and onSuccess after a successful confirm", async () => {
    render(<SettleViaWalletDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() => {
      expect(broadcastWalletChange).toHaveBeenCalled();
      expect(defaultProps.onSuccess).toHaveBeenCalled();
    });
  });

  it("propagates notes from the textarea into the onConfirm payload", async () => {
    render(<SettleViaWalletDialog {...defaultProps} />);
    const notesField = screen.getByLabelText(/notes/i);
    fireEvent.change(notesField, { target: { value: "Paid Ramesh" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() => {
      expect(defaultProps.onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ notes: "Paid Ramesh" })
      );
    });
  });

  it("surfaces an inline error when onConfirm throws", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("boom"));
    render(<SettleViaWalletDialog {...defaultProps} onConfirm={failing} />);
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() => {
      expect(screen.getByText("boom")).toBeInTheDocument();
    });
    expect(defaultProps.onSuccess).not.toHaveBeenCalled();
  });
});
