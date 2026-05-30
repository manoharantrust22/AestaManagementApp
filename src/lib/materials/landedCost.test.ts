import { describe, it, expect } from "vitest";
import { computeLandedCost, landedCostNote } from "./landedCost";

describe("computeLandedCost", () => {
  it("returns the bare price when there are no extras", () => {
    const b = computeLandedCost({ current_price: 5500 });
    expect(b).toEqual({
      base: 5500,
      gstExtra: 0,
      transportExtra: 0,
      landed: 5500,
    });
  });

  it("adds transport when the price excludes it", () => {
    const b = computeLandedCost({
      current_price: 5500,
      price_includes_transport: false,
      transport_cost: 300,
    });
    expect(b.transportExtra).toBe(300);
    expect(b.landed).toBe(5800);
  });

  it("ignores transport_cost when the price already includes transport", () => {
    const b = computeLandedCost({
      current_price: 5500,
      price_includes_transport: true,
      transport_cost: 300,
      loading_cost: 50,
      unloading_cost: 50,
    });
    // transport excluded from add, but loading + unloading still apply
    expect(b.transportExtra).toBe(100);
    expect(b.landed).toBe(5600);
  });

  it("adds loading and unloading", () => {
    const b = computeLandedCost({
      current_price: 1000,
      loading_cost: 40,
      unloading_cost: 60,
    });
    expect(b.transportExtra).toBe(100);
    expect(b.landed).toBe(1100);
  });

  it("adds GST only when the price is marked GST-exclusive with a real rate", () => {
    const b = computeLandedCost({
      current_price: 1000,
      price_includes_gst: false,
      gst_rate: 18,
    });
    expect(b.gstExtra).toBe(180);
    expect(b.landed).toBe(1180);
  });

  it("does not add GST when the price already includes GST", () => {
    const b = computeLandedCost({
      current_price: 1000,
      price_includes_gst: true,
      gst_rate: 18,
    });
    expect(b.gstExtra).toBe(0);
    expect(b.landed).toBe(1000);
  });

  it("does not add GST when no rate is given (the common no-GST bill)", () => {
    const b = computeLandedCost({
      current_price: 1000,
      price_includes_gst: false,
      gst_rate: null,
    });
    expect(b.gstExtra).toBe(0);
    expect(b.landed).toBe(1000);
  });

  it("combines transport and GST", () => {
    const b = computeLandedCost({
      current_price: 1000,
      price_includes_gst: false,
      gst_rate: 18,
      price_includes_transport: false,
      transport_cost: 200,
    });
    expect(b.gstExtra).toBe(180);
    expect(b.transportExtra).toBe(200);
    expect(b.landed).toBe(1380);
  });

  it("coalesces a null price to 0 (caller is expected to skip these)", () => {
    const b = computeLandedCost({ current_price: null });
    expect(b.landed).toBe(0);
  });
});

describe("landedCostNote", () => {
  it("is empty when nothing is added", () => {
    expect(landedCostNote({ base: 5500, gstExtra: 0, transportExtra: 0, landed: 5500 })).toBe("");
  });

  it("mentions transport only", () => {
    expect(landedCostNote({ base: 5500, gstExtra: 0, transportExtra: 300, landed: 5800 })).toBe(
      "incl. transport"
    );
  });

  it("mentions GST only", () => {
    expect(landedCostNote({ base: 1000, gstExtra: 180, transportExtra: 0, landed: 1180 })).toBe(
      "incl. GST"
    );
  });

  it("mentions both when both apply", () => {
    expect(landedCostNote({ base: 1000, gstExtra: 180, transportExtra: 200, landed: 1380 })).toBe(
      "incl. transport & GST"
    );
  });
});
