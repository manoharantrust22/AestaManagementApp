import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const mockIn = vi.fn();
// `.from(...).select(...).in(...)` chain; `.in` returns a thenable that also
// exposes `.abortSignal()` returning itself (matches the Supabase builder).
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        in: (_col: string, refs: string[]) => {
          const r: any = mockIn(refs);
          r.abortSignal = () => r;
          return r;
        },
      }),
    }),
  }),
}));

import { useSettlementProofFlags } from "./useSettlementProofFlags";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useSettlementProofFlags", () => {
  beforeEach(() => mockIn.mockReset());

  it("does not fetch when refs is empty", () => {
    const { result } = renderHook(
      () => useSettlementProofFlags([], "site-1"),
      { wrapper }
    );
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockIn).not.toHaveBeenCalled();
  });

  it("derives hasProof/hasNotes per ref", async () => {
    mockIn.mockReturnValue(
      Promise.resolve({
        data: [
          { settlement_reference: "A", proof_urls: ["x.png"], proof_url: null, notes: "note" },
          { settlement_reference: "B", proof_urls: [], proof_url: "legacy.png", notes: null },
          { settlement_reference: "C", proof_urls: null, proof_url: null, notes: "  " },
        ],
        error: null,
      })
    );

    const { result } = renderHook(
      () => useSettlementProofFlags(["A", "B", "C"], "site-1"),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const map = result.current.data!;
    expect(map.get("A")).toEqual({ hasProof: true, hasNotes: true });
    expect(map.get("B")).toEqual({ hasProof: true, hasNotes: false });
    expect(map.get("C")).toEqual({ hasProof: false, hasNotes: false });
  });
});
