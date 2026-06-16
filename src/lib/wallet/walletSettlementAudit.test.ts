import { describe, it, expect } from "vitest";
import { buildFundedByRows } from "./walletSettlementAudit";
import type { AuditAllocation } from "./walletSettlementAudit";

describe("buildFundedByRows", () => {
  it("maps a single source allocation with its deposit date", () => {
    const allocs: AuditAllocation[] = [
      { payer_source: "amma_money", payer_name: null, amount: 720, kind: "source", deposit_date: "2026-05-16" },
    ];
    expect(buildFundedByRows(allocs)).toEqual([
      { label: "Amma Money", amount: 720, depositDate: "2026-05-16", isPending: false },
    ]);
  });

  it("orders source rows by deposit date (oldest first) then pending last", () => {
    const allocs: AuditAllocation[] = [
      { payer_source: "pending", payer_name: null, amount: 50, kind: "pending", deposit_date: null },
      { payer_source: "trust_account", payer_name: null, amount: 130, kind: "source", deposit_date: "2026-06-03" },
      { payer_source: "amma_money", payer_name: null, amount: 20, kind: "source", deposit_date: "2026-05-16" },
    ];
    expect(buildFundedByRows(allocs)).toEqual([
      { label: "Amma Money", amount: 20, depositDate: "2026-05-16", isPending: false },
      { label: "Trust Account", amount: 130, depositDate: "2026-06-03", isPending: false },
      { label: "Pending", amount: 50, depositDate: null, isPending: true },
    ]);
  });

  it("labels a fully-pending settlement", () => {
    const allocs: AuditAllocation[] = [
      { payer_source: "pending", payer_name: null, amount: 100, kind: "pending", deposit_date: null },
    ];
    expect(buildFundedByRows(allocs)).toEqual([
      { label: "Pending", amount: 100, depositDate: null, isPending: true },
    ]);
  });

  it("uses the custom name for name-bearing sources (other_site_money)", () => {
    const allocs: AuditAllocation[] = [
      { payer_source: "other_site_money", payer_name: "Mathur site", amount: 300, kind: "source", deposit_date: "2026-06-01" },
    ];
    expect(buildFundedByRows(allocs)).toEqual([
      { label: "Mathur site", amount: 300, depositDate: "2026-06-01", isPending: false },
    ]);
  });
});
