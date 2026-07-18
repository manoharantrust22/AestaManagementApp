import { describe, it, expect } from "vitest";
import {
  threadCurrentStep,
  stageStepCounts,
  dominantRole,
  STAGE_STEPS,
} from "./stageFilter";
import type { MaterialThread, ThreadPO } from "./threadTypes";

function makePO(overrides: Partial<ThreadPO> = {}): ThreadPO {
  return {
    id: "po-1",
    po_number: "PO-TEST-1",
    vendor_id: "v-1",
    amount: 8400,
    weight_based: false,
    qty: 30,
    received_qty: 30,
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
    section: "Ground Floor",
    floor: null,
    priority: "high",
    stage: "delivered",
    kind: "group",
    advance: false,
    material_id: "m-1",
    material_name: "PPC Cement (50kg bag)",
    material_unit: "bag",
    qty: 30,
    requested_by: null,
    requested_at: "2026-03-18",
    po: makePO(),
    inventory: { batch: "MAT-1", received: 30, used: 0, remaining: 30 },
    ...overrides,
  };
}

describe("threadCurrentStep", () => {
  it("maps requested → po (combined Approve+PO step)", () => {
    expect(threadCurrentStep(makeThread({ stage: "requested", po: undefined }))).toBe("po");
  });

  it("maps approved → po", () => {
    expect(threadCurrentStep(makeThread({ stage: "approved", po: undefined }))).toBe("po");
  });

  it("maps ordered (and partial) → deliver", () => {
    expect(threadCurrentStep(makeThread({ stage: "ordered", po: makePO({ received_qty: 0 }) }))).toBe("deliver");
    expect(threadCurrentStep(makeThread({ stage: "ordered", po: makePO({ received_qty: 10, qty: 30 }) }))).toBe("deliver");
  });

  it("maps in-transit → deliver", () => {
    expect(threadCurrentStep(makeThread({ stage: "in-transit", po: makePO({ received_qty: 0 }) }))).toBe("deliver");
  });

  it("maps delivered (on-delivery, unsettled) → settle", () => {
    expect(threadCurrentStep(makeThread({ stage: "delivered" }))).toBe("settle");
  });

  it("maps delivered + advance-paid → inuse (nothing left but usage)", () => {
    const t = makeThread({
      stage: "delivered",
      po: makePO({ payment_timing: "advance", advance_paid: 8400 }),
    });
    expect(threadCurrentStep(t)).toBe("inuse");
  });

  it("maps delivered + already settled → inuse", () => {
    const t = makeThread({
      stage: "delivered",
      settlement: { status: "settled", amount: 8400, paid_by: "office" },
    });
    expect(threadCurrentStep(t)).toBe("inuse");
  });

  it("maps settled / in-use / exhausted → inuse", () => {
    expect(threadCurrentStep(makeThread({ stage: "settled" }))).toBe("inuse");
    expect(threadCurrentStep(makeThread({ stage: "in-use" }))).toBe("inuse");
    expect(threadCurrentStep(makeThread({ stage: "exhausted" }))).toBe("inuse");
  });

  it("excludes rejected (→ null)", () => {
    expect(threadCurrentStep(makeThread({ stage: "rejected" }))).toBeNull();
  });

  it("treats spot purchases as in-use", () => {
    expect(
      threadCurrentStep(makeThread({ purchase_type: "spot", stage: "requested", po: undefined }))
    ).toBe("inuse");
  });
});

describe("stageStepCounts", () => {
  it("buckets totals by current step and ignores rejected", () => {
    const threads = [
      makeThread({ id: "a", stage: "requested", po: undefined }),
      makeThread({ id: "b", stage: "approved", po: undefined }),
      makeThread({ id: "c", stage: "ordered", po: makePO({ received_qty: 0 }) }),
      makeThread({ id: "d", stage: "delivered" }), // settle
      makeThread({ id: "e", stage: "in-use" }), // inuse
      makeThread({ id: "f", stage: "exhausted" }), // inuse
      makeThread({ id: "g", stage: "rejected" }), // excluded
    ];
    const c = stageStepCounts(threads);
    expect(c.po.total).toBe(2); // requested + approved share the combined PO step
    expect(c.deliver.total).toBe(1);
    expect(c.settle.total).toBe(1);
    expect(c.inuse.total).toBe(2);
  });

  it("counts action-required threads by responsible role", () => {
    const threads = [
      makeThread({ id: "a", stage: "requested", po: undefined }), // office (create PO)
      makeThread({ id: "b", stage: "approved", po: undefined }), // office (create PO)
      makeThread({ id: "c", stage: "ordered", po: makePO({ received_qty: 0 }) }), // engineer
      makeThread({ id: "d", stage: "delivered" }), // office (settle)
      makeThread({ id: "e", stage: "in-use" }), // engineer (log usage)
    ];
    const c = stageStepCounts(threads);
    expect(c.po.action.office).toBe(2);
    expect(c.deliver.action.engineer).toBe(1);
    expect(c.settle.action.office).toBe(1);
    expect(c.inuse.action.engineer).toBe(1);
    expect(c.inuse.action.total).toBe(1);
  });

  it("includes a thread in its bucket total but not in action counts when no action is due", () => {
    // mirror threads are read-only → nextAction === null
    const mirror = makeThread({ id: "m", stage: "delivered", is_mirror: true });
    // exhausted with nothing pending → no action
    const done = makeThread({ id: "x", stage: "exhausted", inter_site_pending: false });
    const c = stageStepCounts([mirror, done]);
    expect(c.settle.total).toBe(1);
    expect(c.settle.action.total).toBe(0);
    expect(c.inuse.total).toBe(1);
    expect(c.inuse.action.total).toBe(0);
  });
});

describe("dominantRole", () => {
  it("falls back to the step's canonical role when nothing is actionable", () => {
    const settle = STAGE_STEPS.find((s) => s.key === "settle")!;
    expect(dominantRole(settle, { total: 3, action: { admin: 0, engineer: 0, office: 0, total: 0 } })).toBe("office");
  });

  it("picks the role with the most pending actions", () => {
    const inuse = STAGE_STEPS.find((s) => s.key === "inuse")!;
    expect(
      dominantRole(inuse, { total: 5, action: { admin: 0, engineer: 1, office: 3, total: 4 } })
    ).toBe("office");
  });
});
