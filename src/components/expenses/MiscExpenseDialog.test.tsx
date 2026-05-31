import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import MiscExpenseDialog from "./MiscExpenseDialog";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
  // PayerSourceSelector (rendered inside the dialog) reads auth via the
  // non-throwing useOptionalAuth; undefined → no inline "+ Add" (not asserted here).
  useOptionalAuth: vi.fn(),
}));
vi.mock("@/contexts/SiteContext", () => ({
  useSite: vi.fn(() => ({
    selectedSite: { id: "site-1", name: "Padmavathy" },
  })),
}));
vi.mock("@/hooks/queries/useEngineerWalletV2", () => ({
  useEngineerWalletBalance: vi.fn(() => ({
    data: { balance: 10000 },
    isLoading: false,
  })),
}));
vi.mock("@/hooks/queries/useVendors", () => ({
  useVendors: () => ({ data: [] }),
}));
vi.mock("@/hooks/queries/useLaborers", () => ({
  useLaborers: () => ({ data: [] }),
}));
vi.mock("@/hooks/queries/usePayerSources", () => ({
  usePayerSources: () => ({ data: [] }),
  // PayerSourceSelector also calls usePayerSourceMutations; the inline "+ Add"
  // is gated off here (no auth role), so the fns are never invoked.
  usePayerSourceMutations: () => ({
    addCustomSource: vi.fn(),
    updateSource: vi.fn(),
    setHidden: vi.fn(),
    moveSource: vi.fn(),
    deleteSource: vi.fn(),
  }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return { from: () => chain };
  },
}));
vi.mock("@tanstack/react-query", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { useAuth } from "@/contexts/AuthContext";

describe("MiscExpenseDialog — site_engineer view", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      userProfile: { id: "u-1", name: "Ajith Kumar", role: "site_engineer" },
    } as any);
  });

  it("hides WHO IS PAYING radios for site engineers", () => {
    render(<MiscExpenseDialog open onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.queryByText(/who is paying/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/company direct/i)).not.toBeInTheDocument();
  });

  it("renders WalletBalancePreview for site engineers", () => {
    render(<MiscExpenseDialog open onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText(/Your wallet · Padmavathy/i)).toBeInTheDocument();
    // balance shows in both "Current balance" and "After this expense" rows when amount=0
    expect(screen.getAllByText("₹10,000").length).toBeGreaterThan(0);
  });

  it("hides the Payment Source chip row for site engineers", () => {
    render(<MiscExpenseDialog open onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.queryByText(/^Payment Source$/i)).not.toBeInTheDocument();
  });
});

describe("MiscExpenseDialog — admin view (regression)", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      userProfile: { id: "u-admin", name: "Hari Admin", role: "admin" },
    } as any);
  });

  it("shows WHO IS PAYING radios for admin", () => {
    render(<MiscExpenseDialog open onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText(/who is paying/i)).toBeInTheDocument();
    expect(screen.getByText(/company direct/i)).toBeInTheDocument();
  });

  it("shows the Payment Source chip row for admin", () => {
    render(<MiscExpenseDialog open onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText(/^Payment Source$/i)).toBeInTheDocument();
  });
});
