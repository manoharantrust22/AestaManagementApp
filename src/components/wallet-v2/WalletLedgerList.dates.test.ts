import { describe, it, expect } from "vitest";
import type { WalletLedgerEntry } from "@/types/engineer-wallet-v2.types";
import { settlementDateFromDescription, headlineDateOf } from "./WalletLedgerList";

// Minimal row factory — headlineDateOf only reads transaction_type/date/description.
function row(partial: Partial<WalletLedgerEntry>): WalletLedgerEntry {
  return {
    id: "x",
    transaction_type: "spend",
    transaction_date: "2026-05-30",
    description: null,
    ...partial,
  } as WalletLedgerEntry;
}

describe("settlementDateFromDescription", () => {
  it("parses the date from a salary-settlement SET reference", () => {
    expect(settlementDateFromDescription("Salary settlement SET-260528-003")?.format("YYYY-MM-DD"))
      .toBe("2026-05-28");
  });

  it("parses a SET reference embedded in a contract-payment description", () => {
    expect(settlementDateFromDescription("Contract payment for Chithranjith  (SET-260525-001)")?.format("YYYY-MM-DD"))
      .toBe("2026-05-25");
  });

  it("returns null for non-SET descriptions (misc / group stock / empty)", () => {
    expect(settlementDateFromDescription("Misc expense MISC-260530-001")).toBeNull();
    expect(settlementDateFromDescription("Group stock advance payment")).toBeNull();
    expect(settlementDateFromDescription(null)).toBeNull();
    expect(settlementDateFromDescription("")).toBeNull();
  });
});

describe("headlineDateOf", () => {
  it("uses the settlement date for a salary-settlement spend, not the keyed-in date", () => {
    const r = row({ transaction_type: "spend", transaction_date: "2026-05-30", description: "Salary settlement SET-260528-003" });
    expect(headlineDateOf(r).format("YYYY-MM-DD")).toBe("2026-05-28");
  });

  it("falls back to transaction_date for a spend with no SET reference", () => {
    const r = row({ transaction_type: "spend", transaction_date: "2026-05-16", description: "Group stock advance payment" });
    expect(headlineDateOf(r).format("YYYY-MM-DD")).toBe("2026-05-16");
  });

  it("uses transaction_date for non-spend rows even if a SET ref is present", () => {
    const r = row({ transaction_type: "deposit", transaction_date: "2026-05-30", description: "Refund of SET-260528-003" });
    expect(headlineDateOf(r).format("YYYY-MM-DD")).toBe("2026-05-30");
  });
});

describe("re-sort by settlement date", () => {
  it("orders settlement spends by settlement date desc, regardless of keyed-in date", () => {
    // Mirrors the real Srinivasan data: keyed-in (transaction_date) order scrambles
    // the settlement dates. After re-sorting we want clean settlement-date order.
    const server = [
      row({ id: "a", transaction_date: "2026-05-30", description: "Salary settlement SET-260528-003" }), // settled 28
      row({ id: "b", transaction_date: "2026-05-30", description: "Salary settlement SET-260529-001" }), // settled 29
      row({ id: "c", transaction_date: "2026-05-29", description: "Salary settlement SET-260527-001" }), // settled 27
      row({ id: "d", transaction_date: "2026-05-21", description: "Salary settlement SET-260518-001" }), // settled 18
      row({ id: "e", transaction_date: "2026-05-21", description: "Salary settlement SET-260519-002" }), // settled 19
    ];

    const sorted = server.slice().sort((x, y) => headlineDateOf(y).valueOf() - headlineDateOf(x).valueOf());

    expect(sorted.map((r) => r.id)).toEqual(["b", "a", "c", "e", "d"]); // 29,28,27,19,18
  });

  it("is stable for rows sharing the same settlement date", () => {
    const same = [
      row({ id: "first", transaction_date: "2026-05-22", description: "Salary settlement SET-260520-001" }),
      row({ id: "second", transaction_date: "2026-05-21", description: "Salary settlement SET-260520-002" }),
    ];
    const sorted = same.slice().sort((x, y) => headlineDateOf(y).valueOf() - headlineDateOf(x).valueOf());
    expect(sorted.map((r) => r.id)).toEqual(["first", "second"]);
  });
});
