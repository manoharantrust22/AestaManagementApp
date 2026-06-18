import { describe, it, expect } from "vitest";
import {
  aggregatePayerBreakdown,
  breakdownSummary,
  consolidateTaskWorkRows,
  isConsolidatedTaskWork,
  type TwExpenseRowLike,
  type TwPackageMeta,
} from "./taskWorkExpenseConsolidation";

const REF = "TW-260618-001";

function children(): TwExpenseRowLike[] {
  return [
    {
      id: "p1",
      amount: 4000,
      date: "2026-06-10",
      description: "Task Work (advance) - House Interior plastering",
      payer_name: "Own Money",
      payer_source_split: null,
      payment_mode: "cash",
      settlement_reference: REF,
      source_type: "task_work_payment",
      source_id: "p1",
    },
    {
      id: "p2",
      amount: 2250,
      date: "2026-06-12",
      description: "Task Work (part) - House Interior plastering",
      payer_name: "Client Money",
      payer_source_split: [{ source: "client_money", amount: 2250 }],
      payment_mode: "upi",
      settlement_reference: REF,
      source_type: "task_work_payment",
      source_id: "p2",
    },
    {
      id: "p3",
      amount: 1000,
      date: "2026-06-14",
      description: "Task Work (advance) - House Interior plastering",
      payer_name: "Own Money", // view default for a wallet row
      // Derived from engineer_wallet_spend_allocations by the view.
      payer_source_split: [
        { source: "own_money", amount: 600 },
        { source: "client_money", amount: 400 },
      ],
      engineer_transaction_id: "etx-1",
      payment_mode: "upi",
      settlement_reference: REF,
      source_type: "task_work_payment",
      source_id: "p3",
    },
  ];
}

const pkgMeta = new Map<string, TwPackageMeta>([
  [
    REF,
    {
      package_number: REF,
      title: "House Interior plastering",
      maistry_name: "Varun",
      status: "active",
      parent_subcontract_title: null,
    },
  ],
]);

describe("consolidateTaskWorkRows", () => {
  it("collapses a package's payments into one synthetic row and leaves other rows untouched", () => {
    const misc: TwExpenseRowLike = {
      id: "m1",
      amount: 500,
      date: "2026-06-15",
      source_type: "misc_expense",
      source_id: "m1",
    };
    const out = consolidateTaskWorkRows([...children(), misc], pkgMeta);

    expect(out).toHaveLength(2); // 1 misc + 1 consolidated
    const consol = out.find((r) => isConsolidatedTaskWork(r))!;
    expect(consol).toBeTruthy();
    expect(consol.amount).toBe(7250); // 4000 + 2250 + 1000
    expect(consol.source_id).toBe(`tw:${REF}`);
    expect(consol.vendor_name).toBe("Varun");
    expect(consol.description).toContain("Varun");
    expect(consol.description).toContain("House Interior plastering");
    expect(consol.__taskChildren).toHaveLength(3);
    expect(consol.date).toBe("2026-06-14"); // latest payment date

    // the misc row passes through unchanged
    const passthrough = out.find((r) => r.source_type === "misc_expense")!;
    expect(passthrough.amount).toBe(500);
    expect(isConsolidatedTaskWork(passthrough)).toBe(false);
  });

  it("returns the input untouched when there are no task-work rows", () => {
    const rows: TwExpenseRowLike[] = [
      { id: "m1", amount: 500, date: "2026-06-15", source_type: "misc_expense" },
    ];
    expect(consolidateTaskWorkRows(rows, pkgMeta)).toBe(rows);
  });

  it("leaves a task-work row ungrouped (not merged) when it has no package ref", () => {
    const orphan: TwExpenseRowLike = {
      id: "x1",
      amount: 100,
      date: "2026-06-16",
      source_type: "task_work_payment",
      settlement_reference: null,
    };
    const out = consolidateTaskWorkRows([orphan], pkgMeta);
    expect(out).toHaveLength(1);
    expect(isConsolidatedTaskWork(out[0])).toBe(false); // not a synthetic row
  });
});

describe("aggregatePayerBreakdown", () => {
  it("sums each payment source across all payments (direct single, split, and wallet-derived split)", () => {
    const bd = aggregatePayerBreakdown(children());
    // Own = 4000 (p1) + 600 (p3 wallet) = 4600; Client = 2250 (p2) + 400 (p3) = 2650
    expect(bd).toHaveLength(2);
    expect(bd[0].amount).toBe(4600); // largest first
    expect(bd[1].amount).toBe(2650);
    const total = bd.reduce((s, b) => s + b.amount, 0);
    expect(total).toBe(7250); // never loses a rupee
  });
});

describe("breakdownSummary", () => {
  it("renders a compact per-source string", () => {
    const s = breakdownSummary(children());
    expect(s).toContain("4,600");
    expect(s).toContain("2,650");
    expect(s).toContain("·");
  });

  it("returns a dash when there is nothing to summarise", () => {
    expect(breakdownSummary([])).toBe("—");
  });
});
