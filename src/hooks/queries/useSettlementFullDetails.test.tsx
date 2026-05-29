import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const mockGet = vi.fn();
// Mock the dialog module so we don't pull its full Supabase fetch into the test.
vi.mock("@/components/payments/SettlementRefDetailDialog", () => ({
  __esModule: true,
  default: () => null,
  getSettlementDetailsByReference: (...args: any[]) => mockGet(...args),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

import { useSettlementFullDetails } from "./useSettlementFullDetails";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useSettlementFullDetails", () => {
  beforeEach(() => mockGet.mockReset());

  it("does not fetch when ref is null", () => {
    const { result } = renderHook(
      () => useSettlementFullDetails(null, "site-1"),
      { wrapper }
    );
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("returns the SettlementDetails from getSettlementDetailsByReference", async () => {
    const details = {
      settlementReference: "SET-1",
      proofUrls: ["a.png"],
      notes: "hi",
      isCancelled: false,
    } as any;
    mockGet.mockResolvedValue(details);

    const { result } = renderHook(
      () => useSettlementFullDetails("SET-1", "site-1"),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(details);
    expect(mockGet).toHaveBeenCalledWith(expect.anything(), "SET-1");
  });

  it("passes through null when the settlement is not found", async () => {
    mockGet.mockResolvedValue(null);
    const { result } = renderHook(
      () => useSettlementFullDetails("SET-X", "site-1"),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
