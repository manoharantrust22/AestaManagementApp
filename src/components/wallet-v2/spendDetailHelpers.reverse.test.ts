import { describe, it, expect } from "vitest";
import { spendReverseMode, type WalletSpendSourceType } from "./spendDetailHelpers";

// Defaults for a plain, reversible material spend; override per case.
const base = {
  transactionType: "spend" as string,
  cancelledAt: null as string | null,
  settlementGroupId: null as string | null,
  kind: "other" as const,
  sourceType: "material" as WalletSpendSourceType | null,
};

describe("spendReverseMode", () => {
  it("routes salary-classified spends to the existing settlement reverse", () => {
    expect(spendReverseMode({ ...base, kind: "salary", sourceType: "none" })).toBe(
      "settlement"
    );
  });

  it("routes contract-classified spends to settlement reverse", () => {
    expect(spendReverseMode({ ...base, kind: "contract", sourceType: "none" })).toBe(
      "settlement"
    );
  });

  it("routes a spend carrying a settlement_group_id to settlement reverse", () => {
    expect(
      spendReverseMode({ ...base, kind: "other", settlementGroupId: "grp-1" })
    ).toBe("settlement");
  });

  it.each(["material", "misc", "rental", "tea", "task_work", "subcontract"] as const)(
    "routes a %s-linked spend to cascade reverse",
    (sourceType) => {
      expect(spendReverseMode({ ...base, sourceType })).toBe("cascade");
    }
  );

  it("routes a section payment to cascade even when its description reads as a contract", () => {
    // recordSubcontractPayment describes the spend "Contract <title> (<type>)", so a
    // contract titled e.g. "payment block A" makes classifySpend return 'contract'.
    // The DB-resolved sourceType is authoritative and must win: a section payment has
    // no settlement group, so 'settlement' would reverse nothing.
    expect(
      spendReverseMode({ ...base, kind: "contract", sourceType: "subcontract" })
    ).toBe("cascade");
  });

  it("keeps a settlement-group-backed spend on the settlement path", () => {
    // Guard the precedence added above: a real salary settlement that happens to
    // carry a group id must still route to reverse_settlement.
    expect(
      spendReverseMode({ ...base, kind: "contract", settlementGroupId: "grp-1", sourceType: "salary" })
    ).toBe("settlement");
  });

  it("returns 'none' for a return transaction", () => {
    expect(spendReverseMode({ ...base, transactionType: "return" })).toBe("none");
  });

  it("returns 'none' for a deposit", () => {
    expect(spendReverseMode({ ...base, transactionType: "deposit" })).toBe("none");
  });

  it("returns 'none' for an already-cancelled spend", () => {
    expect(
      spendReverseMode({ ...base, cancelledAt: "2026-06-16T00:00:00Z" })
    ).toBe("none");
  });

  it("returns 'none' for an ad-hoc spend with no linked source", () => {
    expect(spendReverseMode({ ...base, kind: "other", sourceType: "none" })).toBe(
      "none"
    );
  });

  it("returns 'none' for an ORPHAN misc spend (MISC description but no linked record)", () => {
    // The duplicate-reference bug left spends described 'Misc expense MISC-…' with
    // no misc_expenses row. classifySpend → 'misc' but the source lookup → 'none',
    // so no reverse flow applies and the admin hard-delete path takes over.
    expect(spendReverseMode({ ...base, kind: "misc", sourceType: "none" })).toBe(
      "none"
    );
  });

  it("treats null sourceType (lookup not loaded yet) as none, not cascade", () => {
    expect(spendReverseMode({ ...base, sourceType: null })).toBe("none");
  });
});
