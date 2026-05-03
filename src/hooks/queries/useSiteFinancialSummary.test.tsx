import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSiteFinancialSummary } from "./useSiteFinancialSummary";

const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: mockFrom, rpc: mockRpc }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useSiteFinancialSummary", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockRpc.mockReset();
  });

  it("computes the rollup correctly and excludes cancelled extras", async () => {
    mockFrom.mockImplementation((table: string) => {
      switch (table) {
        case "sites":
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { project_contract_value: "5000000" },
                  error: null,
                }),
              }),
            }),
          };
        case "client_payments":
          return {
            select: () => ({
              eq: async () => ({
                data: [{ amount: "3000000" }, { amount: "800000" }],
                error: null,
              }),
            }),
          };
        case "site_additional_works":
          return {
            select: () => ({
              eq: async () => ({
                data: [
                  { confirmed_amount: "400000", status: "confirmed" },
                  { confirmed_amount: "200000", status: "paid" },
                  { confirmed_amount: "999999", status: "cancelled" }, // excluded
                  { confirmed_amount: null, status: "quoted" },          // excluded
                ],
                error: null,
              }),
            }),
          };
        default:
          throw new Error(`unexpected table ${table}`);
      }
    });
    mockRpc.mockResolvedValue({ data: "350000", error: null });

    const { result } = renderHook(() => useSiteFinancialSummary("site-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const s = result.current.data!;
    expect(s.baseContract).toBe(5_000_000);
    expect(s.additionalWorksConfirmed).toBe(600_000);
    expect(s.totalContract).toBe(5_600_000);
    expect(s.clientPaid).toBe(3_800_000);
    expect(s.remainingFromClient).toBe(1_800_000);
    expect(s.supervisorCost).toBe(350_000);
    expect(s.netInHand).toBe(3_450_000);
    expect(s.progressPct).toBe(68);
  });
});
