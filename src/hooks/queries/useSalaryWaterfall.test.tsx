import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useSalaryWaterfall } from "./useSalaryWaterfall";

const mockRpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc: mockRpc }) }));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useSalaryWaterfall", () => {
  beforeEach(() => mockRpc.mockReset());

  it("maps RPC response to camelCase WaterfallWeek shape", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          week_start: "2026-04-19",
          week_end: "2026-04-25",
          days_worked: 6,
          laborer_count: 4,
          wages_due: "52400",
          paid: "38200",
          status: "underpaid",
          filled_by: [{ ref: "SET-260423-001", amount: 38200, settled_at: "2026-04-23" }],
        },
      ],
      error: null,
    });

    const { result } = renderHook(
      () => useSalaryWaterfall({ siteId: "site-1", subcontractId: null, dateFrom: null, dateTo: null }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      {
        weekStart: "2026-04-19",
        weekEnd: "2026-04-25",
        daysWorked: 6,
        laborerCount: 4,
        wagesDue: 52400,
        paid: 38200,
        status: "underpaid",
        period: "current",
        filledBy: [
          { ref: "SET-260423-001", amount: 38200, grossAmount: 38200, settledAt: "2026-04-23" },
        ],
      },
    ]);
  });

  it("treats missing filled_by as empty array", async () => {
    mockRpc.mockResolvedValue({
      data: [{
        week_start: "2026-04-12", week_end: "2026-04-18",
        days_worked: 0, laborer_count: 0,
        wages_due: "0", paid: "0",
        status: "pending", filled_by: null,
      }],
      error: null,
    });

    const { result } = renderHook(
      () => useSalaryWaterfall({ siteId: "site-1", subcontractId: null, dateFrom: null, dateTo: null }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].filledBy).toEqual([]);
  });
});
