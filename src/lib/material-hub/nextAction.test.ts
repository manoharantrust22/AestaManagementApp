import { describe, it, expect } from "vitest";
import { nextAction, canActOnNext } from "./nextAction";
import type { MaterialThread, ThreadPO } from "./threadTypes";

function makePO(overrides: Partial<ThreadPO> = {}): ThreadPO {
  return {
    id: "po-1",
    po_number: "PO-TEST-1",
    vendor_id: "v-1",
    amount: 7298,
    weight_based: false,
    qty: 1000,
    received_qty: 1000,
    expected: null,
    status: "delivered",
    payer_site_id: "site-1",
    payment_timing: "on_delivery",
    advance_paid: 0,
    delivery_batches: [],
    ...overrides,
  };
}

function makeThread(overrides: Partial<MaterialThread> = {}): MaterialThread {
  return {
    id: "t-1",
    source: "material_request",
    source_row_id: "mr-1",
    site_id: "site-1",
    section: null,
    floor: null,
    priority: "normal",
    stage: "delivered",
    kind: "own",
    advance: false,
    material_id: "m-1",
    material_name: "Fly Ash Bricks",
    material_unit: "nos",
    qty: 1000,
    requested_by: null,
    requested_at: "2026-07-26",
    po: makePO(),
    ...overrides,
  };
}

describe("nextAction — settle vendor is a SHARED office/engineer step", () => {
  // Regression: PO-MS8VP70K-XDEW (Fly Ash Bricks, ₹7,298) sat delivered-and-
  // unpaid while the site engineer who holds the cash saw only a passive
  // "Waiting for office" chip. The office pays some bills directly, the
  // engineer pays others from his wallet — either may settle.
  it("asks to settle a delivered, unsettled PO", () => {
    const next = nextAction(makeThread());
    expect(next?.verb).toBe("Settle");
  });

  it("lets the site engineer settle a delivered vendor bill", () => {
    const next = nextAction(makeThread());
    expect(canActOnNext(next, "site_engineer")).toBe(true);
  });

  it("still lets office and admin settle a delivered vendor bill", () => {
    const next = nextAction(makeThread());
    expect(canActOnNext(next, "office")).toBe(true);
    expect(canActOnNext(next, "admin")).toBe(true);
  });

  it("lets the site engineer pay an unpaid bulk/advance PO upfront", () => {
    const advanceThread = makeThread({
      stage: "ordered",
      advance: true,
      po: makePO({ status: "ordered", received_qty: 0, advance_paid: 0 }),
    });
    const next = nextAction(advanceThread);
    expect(next?.verb).toBe("Settle");
    expect(canActOnNext(next, "site_engineer")).toBe(true);
    expect(canActOnNext(next, "office")).toBe(true);
  });
});

describe("nextAction — steps that stay owned by one side", () => {
  it("keeps Create PO office-only", () => {
    const next = nextAction(makeThread({ stage: "requested", po: undefined }));
    expect(next?.verb).toBe("Create PO");
    expect(canActOnNext(next, "site_engineer")).toBe(false);
    expect(canActOnNext(next, "office")).toBe(true);
  });

  it("keeps inter-site settlement office-only", () => {
    const next = nextAction(
      makeThread({
        stage: "exhausted",
        kind: "group",
        inter_site_pending: true,
        inter_site_status: "pending_usage",
      })
    );
    expect(next?.verb).toBe("Settle inter-site");
    expect(canActOnNext(next, "site_engineer")).toBe(false);
    expect(canActOnNext(next, "office")).toBe(true);
  });

  it("keeps Record delivery on the site engineer", () => {
    const next = nextAction(
      makeThread({ stage: "ordered", po: makePO({ status: "ordered", received_qty: 0 }) })
    );
    expect(next?.verb).toBe("Record delivery");
    expect(canActOnNext(next, "site_engineer")).toBe(true);
    expect(canActOnNext(next, "office")).toBe(false);
  });
});
