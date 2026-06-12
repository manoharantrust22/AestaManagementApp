import { describe, it, expect } from "vitest";
import { summarizeFilteredThreads } from "./filteredSummary";
import type { MaterialThread } from "./threadTypes";

function thread(overrides: Partial<MaterialThread> = {}): MaterialThread {
  return {
    id: "t",
    source: "material_request",
    source_row_id: "mr",
    site_id: "site-pad",
    section: null,
    floor: null,
    priority: "normal",
    stage: "in-use",
    kind: "group",
    advance: true,
    material_id: "m-cement",
    material_name: "PPC Cement",
    material_unit: "bag",
    qty: 200,
    requested_by: null,
    requested_at: "2026-05-16",
    ...overrides,
  };
}

describe("summarizeFilteredThreads", () => {
  it("aggregates the cement advance batch with a per-site split", () => {
    const t = thread({
      po: {
        id: "po-1",
        po_number: "PO-MP7YYJGX-7EVN",
        vendor_id: "v",
        amount: 61000,
        qty: 200,
        received_qty: 70,
        expected: null,
        status: "partial",
        payer_site_id: "site-sri",
        payment_timing: "advance",
        advance_paid: 61000,
        delivery_batches: [],
      },
      inventory: {
        batch: "MAT-260516-7A41",
        received: 70,
        used: 25,
        remaining: 45,
        per_site: [
          { site_id: "site-pad", site_name: "Padmavathy Apartments", received: 40, used: 21.5 },
          { site_id: "site-sri", site_name: "Srinivasan House & Shop", received: 30, used: 3.5 },
        ],
      },
    });
    const s = summarizeFilteredThreads([t], "Padmavathy Apartments");
    expect(s.ordered).toBe(200);
    expect(s.delivered).toBe(70);
    expect(s.used).toBe(25);
    expect(s.remaining).toBe(45);
    expect(s.unit).toBe("bag");
    expect(s.perSiteUsed).toEqual([
      { site_name: "Padmavathy Apartments", used: 21.5 },
      { site_name: "Srinivasan House & Shop", used: 3.5 },
    ]);
  });

  it("dedupes a batch / PO that appears on two threads", () => {
    const inv = {
      batch: "MAT-1",
      received: 10,
      used: 4,
      remaining: 6,
    };
    const po = {
      id: "po-x",
      po_number: "PO-X",
      vendor_id: "v",
      amount: 100,
      qty: 10,
      received_qty: 10,
      expected: null,
      status: "delivered",
      payer_site_id: "site-pad",
      payment_timing: "on_delivery" as const,
      advance_paid: 0,
      delivery_batches: [],
    };
    const s = summarizeFilteredThreads(
      [thread({ po, inventory: { ...inv } }), thread({ id: "t2", po, inventory: { ...inv } })],
      "Padmavathy Apartments"
    );
    expect(s.ordered).toBe(10);
    expect(s.delivered).toBe(10);
    expect(s.used).toBe(4);
    expect(s.perSiteUsed).toEqual([{ site_name: "Padmavathy Apartments", used: 4 }]);
  });

  it("reports null unit when threads span multiple units", () => {
    const s = summarizeFilteredThreads(
      [
        thread({
          material_unit: "bag",
          po: { id: "p1", po_number: "P1", vendor_id: "v", amount: 1, qty: 5, received_qty: 5, expected: null, status: "delivered", payer_site_id: "s", payment_timing: "on_delivery", advance_paid: 0, delivery_batches: [] },
        }),
        thread({
          id: "t2",
          material_unit: "kg",
          po: { id: "p2", po_number: "P2", vendor_id: "v", amount: 1, qty: 3, received_qty: 3, expected: null, status: "delivered", payer_site_id: "s", payment_timing: "on_delivery", advance_paid: 0, delivery_batches: [] },
        }),
      ],
      "Padmavathy Apartments"
    );
    expect(s.ordered).toBe(8);
    expect(s.unit).toBeNull();
  });
});
