import { describe, it, expect } from "vitest";
import { buildAdvanceExpensePayload, parsePoNotes } from "./advanceExpensePayload";
import type { PayerSourceSplitRow } from "@/types/settlement.types";

const groupPo = {
  id: "po-1",
  site_id: "site-A",
  po_number: "PO-001",
  vendor_id: "v-1",
  vendor: { name: "Vairam" },
  total_amount: 6900,
  transport_cost: 0,
  items: [{ material_id: "m-1", brand_id: null, quantity: 1000, unit_price: 6.9 }],
  internal_notes: JSON.stringify({
    is_group_stock: true,
    site_group_id: "g-1",
    payment_source_site_id: "site-A",
  }),
};

describe("parsePoNotes", () => {
  it("parses a JSON string", () => {
    expect(parsePoNotes('{"is_group_stock":true}')).toEqual({ is_group_stock: true });
  });
  it("passes through an object and tolerates junk", () => {
    expect(parsePoNotes({ is_group_stock: false })).toEqual({ is_group_stock: false });
    expect(parsePoNotes("not json")).toBeNull();
    expect(parsePoNotes(null)).toBeNull();
  });
});

describe("buildAdvanceExpensePayload", () => {
  it("writes a single payer source and marks a group-stock bulk payment paid", () => {
    const { expenseRow, expenseItems, isGroupStock } = buildAdvanceExpensePayload(
      groupPo,
      {
        amount_paid: 6900,
        payment_date: "2026-06-03",
        payment_mode: "upi",
        payer_source: "client_money",
        payer_name: null,
        payer_source_split: null,
        is_complete: true,
        payment_channel: "direct",
        subcontract_id: "sc-1",
      },
      "MPE-TEST",
      "auth-1",
    );
    expect(isGroupStock).toBe(true);
    expect(expenseRow.purchase_type).toBe("group_stock");
    expect(expenseRow.subcontract_id).toBe("sc-1");
    expect(expenseRow.settlement_payer_source).toBe("client_money");
    expect(expenseRow.settlement_payer_name).toBeNull();
    expect(expenseRow.payer_source_split).toBeNull();
    expect(expenseRow.is_paid).toBe(true);
    expect(expenseRow.paid_date).toBe("2026-06-03");
    expect(expenseRow.payment_channel).toBe("direct");
    expect(expenseRow.site_group_id).toBe("g-1");
    expect(expenseRow.paying_site_id).toBe("site-A");
    expect(expenseRow.created_by).toBe("auth-1");
    expect(expenseItems).toHaveLength(1);
    expect(expenseItems[0]).toMatchObject({ material_id: "m-1", brand_id: null, quantity: 1000, unit_price: 6.9 });
  });

  it("writes a split payload and leaves an own-site partial advance unpaid", () => {
    const ownPo = { ...groupPo, internal_notes: null, total_amount: 10000 };
    const split: PayerSourceSplitRow[] = [
      { source: "own_money", amount: 4000 },
      { source: "client_money", amount: 2000 },
    ];
    const { expenseRow, isGroupStock } = buildAdvanceExpensePayload(
      ownPo,
      {
        amount_paid: 6000,
        payment_date: "2026-06-03",
        payer_source: "split",
        payer_name: null,
        payer_source_split: split,
        is_complete: false,
        payment_channel: "direct",
      },
      "MPE-2",
      null,
    );
    expect(isGroupStock).toBe(false);
    expect(expenseRow.purchase_type).toBe("own_site");
    expect(expenseRow.settlement_payer_source).toBe("split");
    expect(expenseRow.payer_source_split).toEqual(split);
    expect(expenseRow.is_paid).toBe(false);
    expect(expenseRow.paid_date).toBeNull();
    expect(expenseRow.site_group_id).toBeNull();
    expect(expenseRow.paying_site_id).toBeNull();
    expect(expenseRow.created_by).toBeNull();
    // No subcontract passed → row stays unlinked (null), not undefined.
    expect(expenseRow.subcontract_id).toBeNull();
  });

  it("keeps engineer_wallet channel for an OWN-SITE engineer advance (the Fly Ash fix)", () => {
    // Regression: own-site PO advances by a site engineer used to fall through
    // to payment_channel='direct' (gated behind isGroupStockAdvancePO in the
    // dialog), so the spend never debited the wallet. Once the dialog passes
    // the wallet fields, useRecordAdvancePayment sets payment_channel
    // ='engineer_wallet' — this asserts the payload faithfully carries it on a
    // NON-group (own-site) PO.
    const ownPo = { ...groupPo, internal_notes: null };
    const { expenseRow, isGroupStock } = buildAdvanceExpensePayload(
      ownPo,
      {
        amount_paid: 6900,
        payment_date: "2026-06-12",
        payment_mode: "cash",
        payer_source: "own_money",
        payer_name: null,
        payer_source_split: null,
        is_complete: true,
        payment_channel: "engineer_wallet",
      },
      "MAT-FLYASH",
      "auth-ajith",
    );
    expect(isGroupStock).toBe(false);
    expect(expenseRow.purchase_type).toBe("own_site");
    expect(expenseRow.payment_channel).toBe("engineer_wallet");
    expect(expenseRow.is_paid).toBe(true);
    expect(expenseRow.paid_date).toBe("2026-06-12");
  });

  it("carries the PO's cluster id even without the group-stock notes marker", () => {
    // Regression: group POs created without internal_notes' is_group_stock
    // marker settled with site_group_id=null — settled on the recording site
    // but forever "pending" on every cluster mate (PO-MM4H84TG-77IX).
    const unmarkedGroupPo = {
      ...groupPo,
      internal_notes: null,
      site_group_id: "g-1",
    };
    const { expenseRow, isGroupStock } = buildAdvanceExpensePayload(
      unmarkedGroupPo,
      {
        amount_paid: 6900,
        payment_date: "2026-02-27",
        payer_source: "client_money",
        payer_name: null,
        payer_source_split: null,
        is_complete: true,
        payment_channel: "direct",
      },
      "MPE-3",
      null,
    );
    // Not group-stock (no inventory machinery), but cluster-visible.
    expect(isGroupStock).toBe(false);
    expect(expenseRow.purchase_type).toBe("own_site");
    expect(expenseRow.site_group_id).toBe("g-1");
    expect(expenseRow.paying_site_id).toBeNull();
  });
});
