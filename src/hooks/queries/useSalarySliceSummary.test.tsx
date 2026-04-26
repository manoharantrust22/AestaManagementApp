import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSalarySliceSummary } from "./useSalarySliceSummary";

const mockRpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc: mockRpc }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useSalarySliceSummary", () => {
  beforeEach(() => mockRpc.mockReset());

  it("calls get_salary_slice_summary with mapped params", async () => {
    mockRpc.mockResolvedValue({
      data: [{
        wages_due: "234400",
        settlements_total: "182400",
        advances_total: "43400",
        paid_to_weeks: "182400",
        future_credit: "0",
        mestri_owed: "52000",
        weeks_count: 12,
        settlement_count: 8,
        advance_count: 5,
      }],
      error: null,
    });

    const { result } = renderHook(
      () => useSalarySliceSummary({
        siteId: "site-1",
        subcontractId: "sub-1",
        dateFrom: "2026-04-01",
        dateTo: "2026-04-26",
      }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockRpc).toHaveBeenCalledWith("get_salary_slice_summary", {
      p_site_id: "site-1",
      p_subcontract_id: "sub-1",
      p_date_from: "2026-04-01",
      p_date_to: "2026-04-26",
    });
    expect(result.current.data).toEqual({
      wagesDue: 234400,
      settlementsTotal: 182400,
      advancesTotal: 43400,
      paidToWeeks: 182400,
      futureCredit: 0,
      mestriOwed: 52000,
      weeksCount: 12,
      settlementCount: 8,
      advanceCount: 5,
    });
  });

  it("returns zero defaults when RPC returns empty array", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(
      () => useSalarySliceSummary({ siteId: "site-1", subcontractId: null, dateFrom: null, dateTo: null }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.wagesDue).toBe(0);
    expect(result.current.data?.mestriOwed).toBe(0);
  });

  it("is disabled when siteId is undefined", () => {
    const { result } = renderHook(
      () => useSalarySliceSummary({ siteId: undefined, subcontractId: null, dateFrom: null, dateTo: null }),
      { wrapper }
    );
    expect(result.current.fetchStatus).toBe("idle");
  });
});
