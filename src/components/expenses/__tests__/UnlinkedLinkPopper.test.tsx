import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UnlinkedLinkPopper } from "../UnlinkedLinkPopper";
import type { Trade } from "@/types/trade.types";

// Mock the service call
vi.mock("@/lib/services/miscExpenseService", () => ({
  updateMiscExpense: vi.fn(),
}));
import { updateMiscExpense } from "@/lib/services/miscExpenseService";

// Stub the supabase client factory used by the component
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({}),
}));

const SAMPLE_TRADES: Trade[] = [
  {
    category: { id: "cat-civil", name: "Civil", isSystemSeed: true } as any,
    contracts: [
      {
        id: "con-1", siteId: "s1", tradeCategoryId: "cat-civil", title: "Plumbing — Block A",
        laborTrackingMode: "daily" as any, isInHouse: false, contractType: "mesthri",
        status: "active" as any, totalValue: 0, mesthriOrSpecialistName: null, createdAt: "",
      },
    ],
  },
];

describe("UnlinkedLinkPopper", () => {
  beforeEach(() => {
    vi.mocked(updateMiscExpense).mockReset();
  });

  it("disables Link button until a subcontract is chosen", () => {
    render(
      <UnlinkedLinkPopper
        open
        anchorEl={document.body}
        miscExpenseId="me-1"
        siteTrades={SAMPLE_TRADES}
        userId="u1"
        userName="User One"
        onClose={() => {}}
        onLinked={() => {}}
      />,
    );
    const linkBtn = screen.getByRole("button", { name: /^link$/i });
    expect(linkBtn).toBeDisabled();
  });

  it("calls updateMiscExpense and onLinked on success", async () => {
    vi.mocked(updateMiscExpense).mockResolvedValueOnce({ success: true, expenseId: "me-1" } as any);
    const onLinked = vi.fn();
    render(
      <UnlinkedLinkPopper
        open
        anchorEl={document.body}
        miscExpenseId="me-1"
        siteTrades={SAMPLE_TRADES}
        userId="u1"
        userName="User One"
        onClose={() => {}}
        onLinked={onLinked}
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.mouseDown(input);
    fireEvent.click(await screen.findByText(/Plumbing — Block A/));

    const linkBtn = screen.getByRole("button", { name: /^link$/i });
    expect(linkBtn).not.toBeDisabled();
    fireEvent.click(linkBtn);

    await waitFor(() => {
      expect(updateMiscExpense).toHaveBeenCalledWith(
        expect.anything(),
        "me-1",
        { subcontract_id: "con-1" },
        "u1",
        "User One",
      );
      expect(onLinked).toHaveBeenCalled();
    });
  });

  it("shows an error Alert when the service returns failure", async () => {
    vi.mocked(updateMiscExpense).mockResolvedValueOnce({ success: false, error: "boom" } as any);
    render(
      <UnlinkedLinkPopper
        open
        anchorEl={document.body}
        miscExpenseId="me-1"
        siteTrades={SAMPLE_TRADES}
        userId="u1"
        userName="User One"
        onClose={() => {}}
        onLinked={() => {}}
      />,
    );
    const input = screen.getByRole("combobox");
    fireEvent.mouseDown(input);
    fireEvent.click(await screen.findByText(/Plumbing — Block A/));
    fireEvent.click(screen.getByRole("button", { name: /^link$/i }));

    expect(await screen.findByText(/boom/)).toBeInTheDocument();
  });
});
