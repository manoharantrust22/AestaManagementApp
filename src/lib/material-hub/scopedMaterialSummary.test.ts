import { describe, it, expect } from "vitest";
import {
  summarizeScopedMaterial,
  type OwnStockRow,
  type OwnUsageRow,
} from "./scopedMaterialSummary";
import type { MaterialThread, ThreadPO, ThreadInventory } from "./threadTypes";

function po(overrides: Partial<ThreadPO> = {}): ThreadPO {
  return {
    id: "po-1",
    po_number: "PO-1",
    vendor_id: "v",
    amount: 1000,
    qty: 100,
    received_qty: 100,
    expected: null,
    status: "delivered",
    payer_site_id: "site-sri",
    payment_timing: "on_delivery",
    advance_paid: 0,
    delivery_batches: [],
    ...overrides,
  };
}

function thread(overrides: Partial<MaterialThread> = {}): MaterialThread {
  return {
    id: "t",
    source: "material_request",
    source_row_id: "mr",
    site_id: "site-sri",
    section: null,
    floor: null,
    priority: "normal",
    stage: "in-use",
    kind: "group",
    advance: false,
    material_id: "m-cement",
    material_name: "PPC Cement",
    material_unit: "bag",
    qty: 100,
    requested_by: null,
    requested_at: "2026-06-01",
    ...overrides,
  };
}

const GROUP_INV: ThreadInventory = {
  batch: "MAT-260613-11C1",
  received: 700,
  used: 50,
  remaining: 650,
  per_site: [
    { site_id: "site-sri", site_name: "Srinivasan House & Shop", received: 400, used: 30 },
    { site_id: "site-pad", site_name: "Padmavathy Apartments", received: 300, used: 20 },
  ],
};

describe("summarizeScopedMaterial", () => {
  it("group-only: totals + per-site used/held, own stays zero/absent", () => {
    const t = thread({
      kind: "group",
      po: po({ id: "po-g", qty: 760, received_qty: 700 }),
      inventory: { ...GROUP_INV },
    });
    const s = summarizeScopedMaterial({
      threads: [t],
      viewingSiteId: "site-sri",
      viewingSiteName: "Srinivasan House & Shop",
      ownStockRows: [],
      ownUsageRows: [],
      groupRefCodes: new Set(["MAT-260613-11C1"]),
    });

    expect(s.group.ordered).toBe(760);
    expect(s.group.delivered).toBe(700);
    expect(s.group.used).toBe(50);
    expect(s.group.remaining).toBe(650);
    expect(s.group.totalReceived).toBe(700);
    expect(s.group.perSite).toEqual([
      { site_id: "site-sri", site_name: "Srinivasan House & Shop", used: 30, held: 370 },
      { site_id: "site-pad", site_name: "Padmavathy Apartments", used: 20, held: 280 },
    ]);

    expect(s.own.ordered).toBe(0);
    expect(s.own.delivered).toBe(0);
    expect(s.own.used).toBe(0);
    expect(s.own.remaining).toBe(0);
    expect(s.own.present).toBe(false);

    expect(s.unit).toBe("bag");
    expect(s.threadCount).toBe(1);
  });

  it("own dedicated PO: ordered/delivered from thread, used/remaining from own stock+usage", () => {
    const t = thread({
      kind: "own",
      po: po({ id: "po-o", qty: 200, received_qty: 200 }),
    });
    const ownStockRows: OwnStockRow[] = [
      { current_qty: 180, batch_code: null }, // shared own bucket
    ];
    const ownUsageRows: OwnUsageRow[] = [
      { quantity: 20, batch_ref_code: null }, // own usage (no group ref)
    ];
    const s = summarizeScopedMaterial({
      threads: [t],
      viewingSiteId: "site-sri",
      viewingSiteName: "Srinivasan House & Shop",
      ownStockRows,
      ownUsageRows,
      groupRefCodes: new Set(),
    });

    expect(s.own.ordered).toBe(200);
    expect(s.own.delivered).toBe(200);
    expect(s.own.used).toBe(20);
    expect(s.own.remaining).toBe(180);
    expect(s.own.present).toBe(true);

    expect(s.group.ordered).toBe(0);
    expect(s.group.used).toBe(0);
    expect(s.group.perSite).toEqual([]);
  });

  it("self-used group batch never leaks into own (excluded by group ref code)", () => {
    const groupThread = thread({
      kind: "group",
      po: po({ id: "po-g2", qty: 100, received_qty: 100 }),
      inventory: {
        batch: "GSP-1",
        received: 100,
        used: 100,
        remaining: 0,
        // single-site self-use — no per_site split
      },
    });
    // The owning site's stock + usage rows for the SAME group batch must be
    // classified as GROUP, not OWN.
    const ownStockRows: OwnStockRow[] = [
      { current_qty: 0, batch_code: "GSP-1" }, // group batch row, fully used
      { current_qty: 40, batch_code: null }, // genuine own bucket
    ];
    const ownUsageRows: OwnUsageRow[] = [
      { quantity: 100, batch_ref_code: "GSP-1" }, // group self-use
      { quantity: 5, batch_ref_code: null }, // genuine own usage
    ];
    const s = summarizeScopedMaterial({
      threads: [groupThread],
      viewingSiteId: "site-sri",
      viewingSiteName: "Srinivasan House & Shop",
      ownStockRows,
      ownUsageRows,
      groupRefCodes: new Set(["GSP-1"]),
    });

    // group keeps the self-used batch
    expect(s.group.used).toBe(100);
    expect(s.group.remaining).toBe(0);
    // own excludes the group rows entirely
    expect(s.own.used).toBe(5);
    expect(s.own.remaining).toBe(40);
  });

  it("uses per-site `remaining` (live current_qty) for held when supplied", () => {
    const t = thread({
      kind: "group",
      po: po({ id: "po-r", qty: 100, received_qty: 100 }),
      inventory: {
        batch: "MAT-R",
        received: 100,
        used: 30,
        remaining: 70,
        per_site: [
          // received − used would say 60, but the live current_qty is 50
          // (a 10-bag decrement had no usage-ledger row) — held must follow it.
          { site_id: "site-sri", site_name: "Srinivasan", received: 80, used: 20, remaining: 50 },
          { site_id: "site-pad", site_name: "Padmavathy", received: 20, used: 10, remaining: 20 },
        ],
      },
    });
    const s = summarizeScopedMaterial({
      threads: [t],
      viewingSiteId: "site-sri",
      viewingSiteName: "Srinivasan",
      ownStockRows: [],
      ownUsageRows: [],
      groupRefCodes: new Set(["MAT-R"]),
    });
    expect(s.group.perSite.map((p) => p.held)).toEqual([50, 20]);
  });

  it("dedupes a PO and a batch shared across two threads", () => {
    const sharedPo = po({ id: "po-dup", qty: 100, received_qty: 80 });
    const sharedInv: ThreadInventory = { batch: "MAT-DUP", received: 80, used: 10, remaining: 70 };
    const s = summarizeScopedMaterial({
      threads: [
        thread({ kind: "group", po: sharedPo, inventory: { ...sharedInv } }),
        thread({ id: "t2", kind: "group", po: sharedPo, inventory: { ...sharedInv } }),
      ],
      viewingSiteId: "site-sri",
      viewingSiteName: "Srinivasan House & Shop",
      ownStockRows: [],
      ownUsageRows: [],
      groupRefCodes: new Set(["MAT-DUP"]),
    });
    expect(s.group.ordered).toBe(100);
    expect(s.group.delivered).toBe(80);
    expect(s.group.used).toBe(10);
    expect(s.group.remaining).toBe(70);
    expect(s.threadCount).toBe(2);
  });

  it("reports null unit across mixed units", () => {
    const s = summarizeScopedMaterial({
      threads: [
        thread({ material_unit: "bag", kind: "group", po: po({ id: "p1", qty: 5, received_qty: 5 }) }),
        thread({ id: "t2", material_unit: "kg", kind: "group", po: po({ id: "p2", qty: 3, received_qty: 3 }) }),
      ],
      viewingSiteId: "site-sri",
      viewingSiteName: "Srinivasan House & Shop",
      ownStockRows: [],
      ownUsageRows: [],
      groupRefCodes: new Set(),
    });
    expect(s.group.ordered).toBe(8);
    expect(s.unit).toBeNull();
  });

  it("empty input → all zeros, own absent, no per-site rows", () => {
    const s = summarizeScopedMaterial({
      threads: [],
      viewingSiteId: "site-sri",
      viewingSiteName: "Srinivasan House & Shop",
      ownStockRows: [],
      ownUsageRows: [],
      groupRefCodes: new Set(),
    });
    expect(s.group).toMatchObject({ ordered: 0, delivered: 0, used: 0, remaining: 0, totalReceived: 0, perSite: [] });
    expect(s.own).toMatchObject({ ordered: 0, delivered: 0, used: 0, remaining: 0, present: false });
    expect(s.unit).toBeNull();
    expect(s.threadCount).toBe(0);
  });

  it("own present when only leftover stock exists (no own PO in scope)", () => {
    const s = summarizeScopedMaterial({
      threads: [thread({ kind: "group", po: po({ id: "po-g3" }), inventory: { ...GROUP_INV } })],
      viewingSiteId: "site-sri",
      viewingSiteName: "Srinivasan House & Shop",
      ownStockRows: [{ current_qty: 12, batch_code: null }],
      ownUsageRows: [],
      groupRefCodes: new Set(["MAT-260613-11C1"]),
    });
    expect(s.own.remaining).toBe(12);
    expect(s.own.present).toBe(true);
  });
});
