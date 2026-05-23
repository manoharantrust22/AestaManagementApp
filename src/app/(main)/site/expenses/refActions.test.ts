import { describe, it, expect } from "vitest";
import { resolveRefAction } from "./refActions";
import type { ExpenseRow } from "@/hooks/queries/useExpensesData";

function baseRow(over: Partial<ExpenseRow>): ExpenseRow {
  return {
    id: "row-1",
    site_id: "site-1",
    date: "2026-03-11",
    recorded_date: "2026-03-11",
    amount: 100,
    description: null,
    category_id: null,
    category_name: null,
    module: "general",
    expense_type: "Material",
    is_cleared: true,
    cleared_date: null,
    contract_id: null,
    subcontract_title: null,
    site_payer_id: null,
    payer_name: null,
    payment_mode: "cash",
    vendor_name: null,
    receipt_url: null,
    paid_by: null,
    entered_by: null,
    entered_by_user_id: null,
    settlement_reference: null,
    settlement_group_id: null,
    engineer_transaction_id: null,
    source_type: "expense",
    source_id: "src-1",
    created_at: "2026-03-11T10:00:00Z",
    is_deleted: false,
    ...over,
  };
}

describe("resolveRefAction", () => {
  it("returns 'unknown' when ref is missing", () => {
    const action = resolveRefAction(baseRow({ settlement_reference: null }));
    expect(action).toEqual({ kind: "unknown" });
  });

  it("routes material_purchase to the material-settlements highlight URL", () => {
    const action = resolveRefAction(
      baseRow({
        source_type: "material_purchase",
        settlement_reference: "SELF-260311-85A2",
      }),
    );
    expect(action).toEqual({
      kind: "navigate",
      url: "/site/material-settlements?highlight=SELF-260311-85A2",
    });
  });

  it("routes SELF- prefix to material-settlements even when source_type is missing", () => {
    const action = resolveRefAction(
      baseRow({
        source_type: "expense",
        settlement_reference: "SELF-260311-85A2",
      }),
    );
    expect(action).toEqual({
      kind: "navigate",
      url: "/site/material-settlements?highlight=SELF-260311-85A2",
    });
  });

  it("routes rental_settlement to the rental-pane action with source_id", () => {
    const action = resolveRefAction(
      baseRow({
        source_type: "rental_settlement",
        source_id: "order-42",
        settlement_reference: "RSET-260112-001",
      }),
    );
    expect(action).toEqual({ kind: "rental-pane", orderId: "order-42" });
  });

  it("routes misc_expense to the miscellaneous page", () => {
    const action = resolveRefAction(
      baseRow({
        source_type: "misc_expense",
        settlement_reference: "MISC-260112-003",
      }),
    );
    expect(action).toEqual({
      kind: "navigate",
      url: "/site/expenses/miscellaneous?highlight=MISC-260112-003",
    });
  });

  it("routes tea_shop_settlement to the tea-shop page", () => {
    const action = resolveRefAction(
      baseRow({
        source_type: "tea_shop_settlement",
        settlement_reference: "TSS-260311-NY9",
      }),
    );
    expect(action).toEqual({
      kind: "navigate",
      url: "/site/tea-shop?highlight=TSS-260311-NY9",
    });
  });

  it("routes subcontract_payment to the subcontracts page", () => {
    const action = resolveRefAction(
      baseRow({
        source_type: "subcontract_payment",
        settlement_reference: "SCP-260311-001",
      }),
    );
    expect(action).toEqual({ kind: "navigate", url: "/site/subcontracts" });
  });

  it("routes salary settlement DLY- to the daily-pane action", () => {
    const action = resolveRefAction(
      baseRow({
        source_type: "settlement",
        settlement_reference: "DLY-260313-005",
        date: "2026-03-13",
      }),
    );
    expect(action).toEqual({
      kind: "daily-pane",
      date: "2026-03-13",
      ref: "DLY-260313-005",
    });
  });

  it("routes salary settlement SET- to the daily-pane action", () => {
    const action = resolveRefAction(
      baseRow({
        source_type: "settlement",
        settlement_reference: "SET-260313-005",
        date: "2026-03-13",
      }),
    );
    expect(action).toEqual({
      kind: "daily-pane",
      date: "2026-03-13",
      ref: "SET-260313-005",
    });
  });

  it("routes salary settlement SS- to the daily-pane action", () => {
    const action = resolveRefAction(
      baseRow({
        source_type: "settlement",
        settlement_reference: "SS-260313-005",
        date: "2026-03-13",
      }),
    );
    expect(action).toEqual({
      kind: "daily-pane",
      date: "2026-03-13",
      ref: "SS-260313-005",
    });
  });

  it("routes WS- with full context to the weekly-pane action", () => {
    const row = baseRow({
      source_type: "settlement",
      settlement_reference: "WS-260313-001",
    });
    (row as any).contract_laborer_id = "lab-1";
    (row as any).week_start = "2026-03-09";
    (row as any).week_end = "2026-03-15";

    const action = resolveRefAction(row);
    expect(action).toEqual({
      kind: "weekly-pane",
      laborerId: "lab-1",
      weekStart: "2026-03-09",
      weekEnd: "2026-03-15",
      ref: "WS-260313-001",
    });
  });

  it("falls back to weekly-fallback-nav when WS- row lacks laborer/week fields", () => {
    const action = resolveRefAction(
      baseRow({
        source_type: "settlement",
        settlement_reference: "WS-260313-001",
      }),
    );
    expect(action).toEqual({
      kind: "weekly-fallback-nav",
      url: "/site/payments?tab=contract&highlight=WS-260313-001",
    });
  });

  it("routes a regular manual-entry expense to edit-dialog", () => {
    const action = resolveRefAction(
      baseRow({
        source_type: "expense",
        settlement_reference: "EXP-XYZ",
      }),
    );
    expect(action).toEqual({ kind: "edit-dialog" });
  });

  it("falls through to edit-dialog for source_type='expense' with an unrecognized ref prefix", () => {
    const action = resolveRefAction(
      baseRow({
        source_type: "expense",
        settlement_reference: "WEIRD-PREFIX-001",
      }),
    );
    expect(action.kind).toBe("edit-dialog");
  });
});
