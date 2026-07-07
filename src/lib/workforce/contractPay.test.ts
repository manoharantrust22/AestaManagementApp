import { describe, it, expect } from "vitest";
import { remainingOwed, clampPayment } from "./contractPay";

describe("remainingOwed", () => {
  it("net minus already-paid", () => {
    expect(remainingOwed(6825, 800)).toBe(6025);
  });
  it("never negative (overpaid)", () => {
    expect(remainingOwed(6825, 7000)).toBe(0);
  });
  it("treats nullish/NaN as 0", () => {
    expect(remainingOwed(NaN as unknown as number, 800)).toBe(0);
    expect(remainingOwed(6825, undefined as unknown as number)).toBe(6825);
  });
});

describe("clampPayment", () => {
  it("caps at the remaining", () => {
    expect(clampPayment(800, 6025)).toBe(800);
    expect(clampPayment(9000, 6025)).toBe(6025);
  });
  it("floors at 0", () => {
    expect(clampPayment(-50, 6025)).toBe(0);
    expect(clampPayment(500, 0)).toBe(0);
  });
});
