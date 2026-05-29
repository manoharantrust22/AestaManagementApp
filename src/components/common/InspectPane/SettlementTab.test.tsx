import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SettlementTab from "./SettlementTab";
import type { InspectEntity } from "./types";

const mockUseFull = vi.fn();
vi.mock("@/hooks/queries/useSettlementFullDetails", () => ({
  useSettlementFullDetails: (...a: any[]) => mockUseFull(...a),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

const mockUseProofFlags = vi.fn();
vi.mock("@/hooks/queries/useSettlementProofFlags", () => ({
  useSettlementProofFlags: (...a: any[]) => mockUseProofFlags(...a),
}));
const mockUseLedger = vi.fn();
vi.mock("@/hooks/queries/usePaymentsLedger", () => ({
  usePaymentsLedger: (...a: any[]) => mockUseLedger(...a),
}));

const dailyEntity: InspectEntity = {
  kind: "daily-date",
  siteId: "site-1",
  date: "2025-11-18",
  settlementRef: "SET-251118-002",
};

const baseDetails = {
  settlementGroupId: "g1",
  settlementReference: "SET-251118-002",
  settlementDate: "2025-11-18",
  totalAmount: 2600,
  distributedToLaborers: 2600,
  actualPaymentDate: null,
  paymentType: null,
  laborerCount: 2,
  paymentChannel: "direct",
  paymentMode: "upi",
  payerSource: "client_money",
  payerName: null,
  payerSourceSplit: null,
  proofUrls: [] as string[],
  notes: null as string | null,
  subcontractId: null,
  subcontractTitle: null,
  createdBy: null,
  createdByName: "Hari",
  createdAt: "2025-11-18",
  isCancelled: false,
  isContract: false,
  weekAllocations: [],
  laborers: [],
};

function renderTab(props: Partial<React.ComponentProps<typeof SettlementTab>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SettlementTab entity={dailyEntity} {...props} />
    </QueryClientProvider>
  );
}

describe("SettlementTab — single settlement", () => {
  beforeEach(() => mockUseFull.mockReset());

  it("renders a proof thumbnail and opens the lightbox on click", () => {
    mockUseFull.mockReturnValue({
      data: { ...baseDetails, proofUrls: ["https://x/p1.png"] },
      isLoading: false,
    });
    renderTab();
    const thumb = screen.getByAltText("Payment proof 1");
    expect(thumb).toBeInTheDocument();
    fireEvent.click(thumb);
    // ScreenshotViewer shows the download control when open
    expect(screen.getByLabelText(/download/i)).toBeInTheDocument();
  });

  it("warns when no screenshot is attached", () => {
    mockUseFull.mockReturnValue({ data: { ...baseDetails, proofUrls: [] }, isLoading: false });
    renderTab();
    expect(screen.getByText(/no screenshot uploaded/i)).toBeInTheDocument();
  });

  it("renders notes when present", () => {
    mockUseFull.mockReturnValue({
      data: { ...baseDetails, notes: "Paid via GPay 2:30pm" },
      isLoading: false,
    });
    renderTab();
    expect(screen.getByText(/paid via gpay/i)).toBeInTheDocument();
  });

  it("shows Edit and calls onEditSettlement with the details", () => {
    const details = { ...baseDetails, proofUrls: ["https://x/p1.png"] };
    mockUseFull.mockReturnValue({ data: details, isLoading: false });
    const onEditSettlement = vi.fn();
    renderTab({ canEditSettlement: true, onEditSettlement });
    fireEvent.click(screen.getByRole("button", { name: /edit settlement/i }));
    expect(onEditSettlement).toHaveBeenCalledWith(details);
  });

  it("hides Edit and shows a Cancelled chip for cancelled settlements", () => {
    mockUseFull.mockReturnValue({
      data: { ...baseDetails, isCancelled: true, proofUrls: [] },
      isLoading: false,
    });
    renderTab({ canEditSettlement: true, onEditSettlement: vi.fn() });
    expect(screen.queryByRole("button", { name: /edit settlement/i })).toBeNull();
    expect(screen.getByText(/cancelled/i)).toBeInTheDocument();
    // No missing-screenshot warning while cancelled
    expect(screen.queryByText(/no screenshot uploaded/i)).toBeNull();
  });

  it("does not show Edit when canEditSettlement is false", () => {
    mockUseFull.mockReturnValue({ data: baseDetails, isLoading: false });
    renderTab({ canEditSettlement: false, onEditSettlement: vi.fn() });
    expect(screen.queryByRole("button", { name: /edit settlement/i })).toBeNull();
  });
});

describe("SettlementTab — daily-market-weekly roll-up", () => {
  beforeEach(() => {
    mockUseProofFlags.mockReset();
    mockUseLedger.mockReset();
  });

  const weekEntity: InspectEntity = {
    kind: "daily-market-weekly",
    siteId: "site-1",
    weekStart: "2025-11-16",
    weekEnd: "2025-11-22",
    scopeFrom: null,
    scopeTo: null,
  };

  function renderRollup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <SettlementTab entity={weekEntity} canEditSettlement onEditSettlement={vi.fn()} />
      </QueryClientProvider>
    );
  }

  it("shows a proof-present icon for refs with a screenshot and a missing icon otherwise", () => {
    mockUseLedger.mockReturnValue({
      data: [
        { date: "2025-11-18", amount: 2600, isPaid: true, isPending: false, settlementRef: "SET-A" },
        { date: "2025-11-17", amount: 1500, isPaid: true, isPending: false, settlementRef: "SET-B" },
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mockUseProofFlags.mockReturnValue({
      data: new Map([
        ["SET-A", { hasProof: true, hasNotes: false }],
        ["SET-B", { hasProof: false, hasNotes: true }],
      ]),
    });
    renderRollup();
    expect(screen.getByLabelText("Screenshot attached")).toBeInTheDocument();
    expect(screen.getByLabelText("No screenshot")).toBeInTheDocument();
    expect(screen.getByLabelText("Has notes")).toBeInTheDocument();
  });
});
