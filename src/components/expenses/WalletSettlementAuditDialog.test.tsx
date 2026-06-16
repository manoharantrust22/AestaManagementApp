import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import WalletSettlementAuditDialog from "./WalletSettlementAuditDialog";
import type { MiscExpenseWithDetails } from "@/types/misc-expense.types";

vi.mock("@/hooks/queries/useWalletSettlementAudit", () => ({
  useWalletSettlementAudit: () => ({
    data: {
      spend: {
        amount: 150,
        transaction_date: "2026-05-30",
        payment_mode: "cash",
        recorded_by: "Ajith Kumar",
        created_at: "2026-05-30",
        edited_at: null,
        edited_by: null,
        edit_reason: null,
        settlement_reference: null,
        settlement_group_id: null,
      },
      allocations: [
        { payer_source: "trust_account", payer_name: null, amount: 130, kind: "source", deposit_date: "2026-06-03" },
        { payer_source: "amma_money", payer_name: null, amount: 20, kind: "source", deposit_date: "2026-05-16" },
      ],
    },
    isLoading: false,
  }),
}));

const expense = {
  id: "x",
  engineer_transaction_id: "spend-1",
  site_engineer_name: "Ajith Kumar",
  amount: 150,
  date: "2026-05-30",
  reference_number: "MISC-260530-003",
} as unknown as MiscExpenseWithDetails;

describe("WalletSettlementAuditDialog", () => {
  it("renders the funding breakdown (sources oldest-first) + recorded line", () => {
    render(<WalletSettlementAuditDialog open onClose={() => {}} expense={expense} />);
    expect(screen.getByText("Wallet settlement audit")).toBeInTheDocument();
    expect(screen.getByText(/Settled via Ajith Kumar's wallet/)).toBeInTheDocument();
    expect(screen.getByText("Amma Money")).toBeInTheDocument();
    expect(screen.getByText("Trust Account")).toBeInTheDocument();
    expect(screen.getByText("₹130")).toBeInTheDocument();
    expect(screen.getByText(/Recorded by/)).toBeInTheDocument();
  });

  it("renders nothing when expense is null", () => {
    const { container } = render(
      <WalletSettlementAuditDialog open onClose={() => {}} expense={null} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
