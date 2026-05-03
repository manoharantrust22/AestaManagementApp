import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useSiteAdditionalWorks,
  useCreateSiteAdditionalWork,
} from "./useSiteAdditionalWorks";

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: mockFrom }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useSiteAdditionalWorks", () => {
  beforeEach(() => mockFrom.mockReset());

  it("queries by site_id and returns rows", async () => {
    const rows = [{ id: "w1", site_id: "site-1", title: "Extra balcony", status: "quoted" }];
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: rows, error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => useSiteAdditionalWorks("site-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(rows);
  });

  it("is disabled when siteId is undefined", () => {
    const { result } = renderHook(() => useSiteAdditionalWorks(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useCreateSiteAdditionalWork", () => {
  beforeEach(() => mockFrom.mockReset());

  it("inserts and returns the row", async () => {
    const row = { id: "new", site_id: "site-1", title: "X", status: "quoted" };
    mockFrom.mockReturnValue({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: row, error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => useCreateSiteAdditionalWork(), { wrapper });
    let returned: unknown;
    await act(async () => {
      returned = await result.current.mutateAsync({
        site_id: "site-1",
        title: "X",
        estimated_amount: 1000,
      } as never);
    });
    expect(returned).toEqual(row);
  });
});
