import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { usePayerSources, useResolvePayerSource } from "./usePayerSources";

const mockOrder = vi.fn();
const mockEq2 = vi.fn(() => ({ order: mockOrder }));
const mockEq1 = vi.fn(() => ({ eq: mockEq2 }));
const mockSelect = vi.fn(() => ({ eq: mockEq1 }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: mockFrom }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mockFrom.mockClear();
  mockSelect.mockClear();
  mockEq1.mockClear();
  mockEq2.mockClear();
  mockOrder.mockReset();
});

describe("usePayerSources", () => {
  it("returns visible rows ordered by sort_order for the given site", async () => {
    mockOrder.mockResolvedValue({
      data: [
        { id: "1", site_id: "site-1", key: "own_money", label: "Own Money", icon: "AccountBalance", color: null, sort_order: 10, requires_name: false, is_built_in: true, is_hidden: false },
        { id: "2", site_id: "site-1", key: "amma_money", label: "Amma Money", icon: "Person", color: null, sort_order: 20, requires_name: false, is_built_in: true, is_hidden: false },
      ],
      error: null,
    });

    const { result } = renderHook(() => usePayerSources("site-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].key).toBe("own_money");
    expect(result.current.data?.[1].key).toBe("amma_money");
    expect(mockFrom).toHaveBeenCalledWith("payer_sources");
    expect(mockEq1).toHaveBeenCalledWith("site_id", "site-1");
    expect(mockEq2).toHaveBeenCalledWith("is_hidden", false);
    expect(mockOrder).toHaveBeenCalledWith("sort_order", { ascending: true });
  });

  it("is disabled when siteId is undefined", () => {
    const { result } = renderHook(() => usePayerSources(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("propagates supabase errors", async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { result } = renderHook(() => usePayerSources("site-1"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useResolvePayerSource", () => {
  it("returns the matching registry row label/icon/color/requires_name when found", async () => {
    mockOrder.mockResolvedValue({
      data: [
        { id: "1", site_id: "site-1", key: "amma_money", label: "Amma Money", icon: "Person", color: null, sort_order: 20, requires_name: false, is_built_in: true, is_hidden: false },
      ],
      error: null,
    });

    const { result } = renderHook(() => useResolvePayerSource("site-1", "amma_money"), { wrapper });

    await waitFor(() => expect(result.current.label).toBe("Amma Money"));
    expect(result.current.icon).toBe("Person");
    expect(result.current.color).toBe(null);
    expect(result.current.requires_name).toBe(false);
  });

  it("returns humanized fallback for unknown key", async () => {
    mockOrder.mockResolvedValue({
      data: [
        { id: "1", site_id: "site-1", key: "own_money", label: "Own Money", icon: "AccountBalance", color: null, sort_order: 10, requires_name: false, is_built_in: true, is_hidden: false },
      ],
      error: null,
    });

    const { result } = renderHook(() => useResolvePayerSource("site-1", "site_cash"), { wrapper });

    await waitFor(() => expect(result.current.label).toBe("Site Cash"));
    expect(result.current.icon).toBe(null);
    expect(result.current.requires_name).toBe(false);
  });

  it("returns empty fallback when key is null", async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useResolvePayerSource("site-1", null), { wrapper });
    await waitFor(() => expect(result.current.label).toBe(""));
  });
});
