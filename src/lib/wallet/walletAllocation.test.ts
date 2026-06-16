import { describe, it, expect } from "vitest";
import {
  deriveAllocations,
  aggregateBySource,
} from "./walletAllocation";
import type { WalletEvent, AllocationRow } from "./walletAllocation";

/** Rows for one spend, in emission order. */
function forSpend(rows: AllocationRow[], spendId: string): AllocationRow[] {
  return rows.filter((r) => r.spendId === spendId);
}

describe("deriveAllocations — FIFO waterfall (spends)", () => {
  it("allocates a spend fully to a single available deposit source", () => {
    const events: WalletEvent[] = [
      { kind: "deposit", id: "d1", source: "amma_money", amount: 1000 },
      { kind: "spend", id: "s1", amount: 600 },
    ];
    expect(deriveAllocations(events)).toEqual([
      { spendId: "s1", depositId: "d1", kind: "source", source: "amma_money", name: null, amount: 600 },
    ]);
  });

  it("spills cleanly across sources at the pool boundary (drains oldest first)", () => {
    // wallet: 150 Amma (older) + 50 Trust; spend 180 -> Amma 150 + Trust 30
    const events: WalletEvent[] = [
      { kind: "deposit", id: "d_amma", source: "amma_money", amount: 150 },
      { kind: "deposit", id: "d_trust", source: "trust_account", amount: 50 },
      { kind: "spend", id: "s1", amount: 180 },
    ];
    expect(forSpend(deriveAllocations(events), "s1")).toEqual([
      { spendId: "s1", depositId: "d_amma", kind: "source", source: "amma_money", name: null, amount: 150 },
      { spendId: "s1", depositId: "d_trust", kind: "source", source: "trust_account", name: null, amount: 30 },
    ]);
  });

  it("drains two deposits of the SAME source FIFO, keeping per-deposit rows", () => {
    const events: WalletEvent[] = [
      { kind: "deposit", id: "d1", source: "amma_money", amount: 100 },
      { kind: "deposit", id: "d2", source: "amma_money", amount: 100 },
      { kind: "spend", id: "s1", amount: 150 },
    ];
    expect(forSpend(deriveAllocations(events), "s1")).toEqual([
      { spendId: "s1", depositId: "d1", kind: "source", source: "amma_money", name: null, amount: 100 },
      { spendId: "s1", depositId: "d2", kind: "source", source: "amma_money", name: null, amount: 50 },
    ]);
  });

  it("records a pending row for the portion exceeding all pools", () => {
    const events: WalletEvent[] = [
      { kind: "deposit", id: "d1", source: "amma_money", amount: 20 },
      { kind: "spend", id: "s1", amount: 150 },
    ];
    expect(forSpend(deriveAllocations(events), "s1")).toEqual([
      { spendId: "s1", depositId: "d1", kind: "source", source: "amma_money", name: null, amount: 20 },
      { spendId: "s1", depositId: null, kind: "pending", source: "pending", name: null, amount: 130 },
    ]);
  });

  it("records a fully-pending spend when there are no deposits", () => {
    const events: WalletEvent[] = [{ kind: "spend", id: "s1", amount: 100 }];
    expect(deriveAllocations(events)).toEqual([
      { spendId: "s1", depositId: null, kind: "pending", source: "pending", name: null, amount: 100 },
    ]);
  });

  it("carries payer_name for name-bearing sources (other_site_money)", () => {
    const events: WalletEvent[] = [
      { kind: "deposit", id: "d1", source: "other_site_money", name: "Mathur site", amount: 100 },
      { kind: "spend", id: "s1", amount: 60 },
    ];
    expect(deriveAllocations(events)).toEqual([
      { spendId: "s1", depositId: "d1", kind: "source", source: "other_site_money", name: "Mathur site", amount: 60 },
    ]);
  });
});

describe("deriveAllocations — deposit-time healing", () => {
  it("a later deposit back-fills the oldest pending gap with its own source", () => {
    // s1 spends 150 when only 20 Amma -> Amma 20 + pending 130.
    // Then a 500 Trust deposit heals the 130; Trust 370 stays available.
    const events: WalletEvent[] = [
      { kind: "deposit", id: "d_amma", source: "amma_money", amount: 20 },
      { kind: "spend", id: "s1", amount: 150 },
      { kind: "deposit", id: "d_trust", source: "trust_account", amount: 500 },
    ];
    const rows = deriveAllocations(events);
    expect(forSpend(rows, "s1")).toEqual([
      { spendId: "s1", depositId: "d_amma", kind: "source", source: "amma_money", name: null, amount: 20 },
      { spendId: "s1", depositId: "d_trust", kind: "source", source: "trust_account", name: null, amount: 130 },
    ]);
    // no pending rows remain anywhere
    expect(rows.some((r) => r.kind === "pending")).toBe(false);
  });

  it("partially heals when the deposit is smaller than the gap", () => {
    const events: WalletEvent[] = [
      { kind: "spend", id: "s1", amount: 200 },
      { kind: "deposit", id: "d1", source: "amma_money", amount: 50 },
    ];
    expect(forSpend(deriveAllocations(events), "s1")).toEqual([
      { spendId: "s1", depositId: "d1", kind: "source", source: "amma_money", name: null, amount: 50 },
      { spendId: "s1", depositId: null, kind: "pending", source: "pending", name: null, amount: 150 },
    ]);
  });

  it("heals multiple pending spends oldest-first with one deposit", () => {
    const events: WalletEvent[] = [
      { kind: "spend", id: "s1", amount: 100 },
      { kind: "spend", id: "s2", amount: 100 },
      { kind: "deposit", id: "d1", source: "client_money", amount: 150 },
    ];
    const rows = deriveAllocations(events);
    expect(forSpend(rows, "s1")).toEqual([
      { spendId: "s1", depositId: "d1", kind: "source", source: "client_money", name: null, amount: 100 },
    ]);
    expect(forSpend(rows, "s2")).toEqual([
      { spendId: "s2", depositId: "d1", kind: "source", source: "client_money", name: null, amount: 50 },
      { spendId: "s2", depositId: null, kind: "pending", source: "pending", name: null, amount: 50 },
    ]);
  });

  it("splits a deposit between healing an old gap and funding a later spend", () => {
    const events: WalletEvent[] = [
      { kind: "spend", id: "s1", amount: 100 },
      { kind: "deposit", id: "d1", source: "amma_money", amount: 300 },
      { kind: "spend", id: "s2", amount: 150 },
    ];
    const rows = deriveAllocations(events);
    expect(forSpend(rows, "s1")).toEqual([
      { spendId: "s1", depositId: "d1", kind: "source", source: "amma_money", name: null, amount: 100 },
    ]);
    expect(forSpend(rows, "s2")).toEqual([
      { spendId: "s2", depositId: "d1", kind: "source", source: "amma_money", name: null, amount: 150 },
    ]);
  });

  it("handles paise without floating-point dust", () => {
    const events: WalletEvent[] = [
      { kind: "deposit", id: "d1", source: "amma_money", amount: 100.1 },
      { kind: "deposit", id: "d2", source: "trust_account", amount: 100 },
      { kind: "spend", id: "s1", amount: 150.05 },
    ];
    expect(forSpend(deriveAllocations(events), "s1")).toEqual([
      { spendId: "s1", depositId: "d1", kind: "source", source: "amma_money", name: null, amount: 100.1 },
      { spendId: "s1", depositId: "d2", kind: "source", source: "trust_account", name: null, amount: 49.95 },
    ]);
  });
});

describe("aggregateBySource", () => {
  it("merges per-deposit rows of the same source and lists pending last", () => {
    const rows: AllocationRow[] = [
      { spendId: "s1", depositId: "d1", kind: "source", source: "amma_money", name: null, amount: 100 },
      { spendId: "s1", depositId: "d2", kind: "source", source: "amma_money", name: null, amount: 50 },
      { spendId: "s1", depositId: "d3", kind: "source", source: "trust_account", name: null, amount: 30 },
      { spendId: "s1", depositId: null, kind: "pending", source: "pending", name: null, amount: 20 },
    ];
    expect(aggregateBySource(rows)).toEqual([
      { source: "amma_money", name: null, amount: 150 },
      { source: "trust_account", name: null, amount: 30 },
      { source: "pending", name: null, amount: 20 },
    ]);
  });

  it("returns a single entry for a single-source spend", () => {
    const rows: AllocationRow[] = [
      { spendId: "s1", depositId: "d1", kind: "source", source: "amma_money", name: null, amount: 600 },
    ];
    expect(aggregateBySource(rows)).toEqual([
      { source: "amma_money", name: null, amount: 600 },
    ]);
  });
});
