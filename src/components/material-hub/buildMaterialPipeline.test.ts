import { describe, it, expect } from "vitest";
import { buildMaterialPipeline } from "./MaterialThreadPipeline";
import type { MaterialThread, ThreadPO } from "@/lib/material-hub/threadTypes";

function makePO(overrides: Partial<ThreadPO> = {}): ThreadPO {
  return {
    id: "po-1",
    po_number: "PO-TEST-1",
    vendor_id: "v-1",
    amount: 8400,
    qty: 30,
    received_qty: 30,
    expected: null,
    status: "delivered",
    payer_site_id: "site-1",
    payment_timing: "on_delivery",
    advance_paid: 0,
    delivery_batches: [
      {
        id: "d-1",
        grn_number: "GRN-1",
        delivery_date: "2026-03-18",
        received_qty: 30,
        accepted_qty: 30,
        verified: true,
      },
    ],
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
    inventory: { batch: "MAT-260320-BAF1", received: 30, used: 0, remaining: 30 },
    ...overrides,
  };
}

describe("buildMaterialPipeline", () => {
  it("renders STOCK between DELIVER and SETTLE", () => {
    const { steps } = buildMaterialPipeline(makeThread());
    expect(steps.map((s) => s.key)).toEqual([
      "requested",
      "approved",
      "ordered",
      "delivered",
      "inventory",
      "settled",
      "in-use",
    ]);
  });

  it("delivered + stocked + unsettled → STOCK done, SETTLE pulsing", () => {
    const { steps } = buildMaterialPipeline(makeThread());
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
    expect(byKey["delivered"].state).toBe("done");
    expect(byKey["inventory"].state).toBe("done");
    expect(byKey["settled"].state).toBe("current");
    expect(byKey["in-use"].state).toBe("upcoming");
  });

  it("advance thread reorders SETTLE before DELIVER", () => {
    const { steps } = buildMaterialPipeline(
      makeThread({
        advance: true,
        stage: "ordered",
        po: makePO({
          status: "ordered",
          received_qty: 0,
          payment_timing: "advance",
          advance_paid: 8400,
          delivery_batches: [],
        }),
        inventory: undefined,
      })
    );
    expect(steps.map((s) => s.key)).toEqual([
      "requested",
      "approved",
      "ordered",
      "settled",
      "delivered",
      "inventory",
      "in-use",
    ]);
  });

  it("advance-paid before delivery → SETTLE done ('advance'), STOCK still upcoming", () => {
    const { steps } = buildMaterialPipeline(
      makeThread({
        advance: true,
        stage: "ordered",
        po: makePO({
          status: "ordered",
          received_qty: 0,
          payment_timing: "advance",
          advance_paid: 8400,
          delivery_batches: [],
        }),
        inventory: undefined,
      })
    );
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
    expect(byKey["settled"].state).toBe("done");
    expect(byKey["settled"].caption).toBe("advance");
    expect(byKey["inventory"].state).toBe("upcoming");
  });

  it("advance thread mid-delivery → SETTLE done, DELIVER pulsing", () => {
    const { steps } = buildMaterialPipeline(
      makeThread({
        advance: true,
        stage: "ordered",
        po: makePO({
          status: "partial",
          qty: 200,
          received_qty: 70,
          payment_timing: "advance",
          advance_paid: 61000,
        }),
        inventory: { batch: "MAT-260516-7A41", received: 70, used: 25, remaining: 45 },
      })
    );
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
    expect(byKey["settled"].state).toBe("done");
    expect(byKey["delivered"].state).toBe("current");
    expect(byKey["inventory"].state).toBe("done");
  });

  it("advance settled but only partially delivered → SETTLE done while DELIVER pulses", () => {
    // The contradiction the user saw: card reads SETTLED but the stepper left
    // SETTLE empty because the lifecycle stage is still 'delivered'.
    const { steps } = buildMaterialPipeline(
      makeThread({
        advance: true,
        stage: "delivered",
        po: makePO({
          status: "partial",
          qty: 200,
          received_qty: 70,
          payment_timing: "advance",
          advance_paid: 61000,
        }),
        settlement: { status: "settled", amount: 61000, paid_by: "wallet" },
        inventory: { batch: "MAT-260516-7A41", received: 70, used: 25, remaining: 45 },
      })
    );
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
    expect(byKey["settled"].state).toBe("done");
    expect(byKey["delivered"].state).toBe("current");
  });

  it("settled stage marks SETTLE done and pulses IN USE next", () => {
    const { steps } = buildMaterialPipeline(
      makeThread({
        stage: "settled",
        settlement: { status: "settled", amount: 8400, paid_by: "office" },
      })
    );
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
    expect(byKey["settled"].state).toBe("done");
    expect(byKey["inventory"].state).toBe("done");
    expect(byKey["in-use"].state).toBe("current");
  });
});
