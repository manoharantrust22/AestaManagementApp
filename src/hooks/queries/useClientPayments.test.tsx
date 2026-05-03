import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useClientPayments, useCreateClientPayment } from "./useClientPayments";

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: mockFrom }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useClientPayments", () => {
  beforeEach(() => mockFrom.mockReset());

  it("returns rows for the site, ordered by payment_date desc", async () => {
    const rows = [
      { id: "p2", site_id: "site-1", amount: 200, payment_date: "2026-05-02" },
      { id: "p1", site_id: "site-1", amount: 100, payment_date: "2026-04-30" },
    ];
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: rows, error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => useClientPayments("site-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(rows);
  });

  it("is disabled when siteId is undefined", () => {
    const { result } = renderHook(() => useClientPayments(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useCreateClientPayment", () => {
  beforeEach(() => mockFrom.mockReset());

  it("inserts with tagged_additional_work_id when supplied", async () => {
    const captured: Array<unknown> = [];
    mockFrom.mockReturnValue({
      insert: (payload: unknown) => {
        captured.push(payload);
        return {
          select: () => ({
            single: async () => ({
              data: { id: "new", ...(payload as Record<string, unknown>) },
              error: null,
            }),
          }),
        };
      },
    });

    const { result } = renderHook(() => useCreateClientPayment(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        siteId: "site-1",
        amount: 100,
        paymentDate: "2026-05-03",
        paymentMode: "cash",
        taggedAdditionalWorkId: "work-9",
      });
    });

    expect(captured[0]).toMatchObject({
      site_id: "site-1",
      tagged_additional_work_id: "work-9",
      payment_phase_id: null,
    });
  });

  it("translates the mutex DB error to a friendly message", async () => {
    mockFrom.mockReturnValue({
      insert: () => ({
        select: () => ({
          single: async () => ({
            data: null,
            error: { message: 'new row for relation "client_payments" violates check constraint "client_payments_tag_mutex"' },
          }),
        }),
      }),
    });

    const { result } = renderHook(() => useCreateClientPayment(), { wrapper });
    await expect(
      result.current.mutateAsync({
        siteId: "site-1",
        amount: 100,
        paymentDate: "2026-05-03",
        paymentMode: "cash",
        paymentPhaseId: "phase-1",
        taggedAdditionalWorkId: "work-9",
      })
    ).rejects.toThrow(/contract phase OR an additional work/);
  });
});
