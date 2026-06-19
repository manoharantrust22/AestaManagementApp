import { describe, it, expect } from "vitest";
import { taskPaymentLineNumbers, formatTaskPaymentRef } from "./paymentRef";

describe("taskPaymentLineNumbers", () => {
  it("numbers payments chronologically, oldest = 1", () => {
    const map = taskPaymentLineNumbers([
      { id: "c", payment_date: "2026-06-13" },
      { id: "a", payment_date: "2026-05-31" },
      { id: "b", payment_date: "2026-06-03" },
    ]);
    expect(map.get("a")).toBe(1);
    expect(map.get("b")).toBe(2);
    expect(map.get("c")).toBe(3);
  });

  it("breaks same-date ties by created_at then id", () => {
    const map = taskPaymentLineNumbers([
      { id: "y", payment_date: "2026-06-10", created_at: "2026-06-10T12:00:00Z" },
      { id: "x", payment_date: "2026-06-10", created_at: "2026-06-10T09:00:00Z" },
    ]);
    expect(map.get("x")).toBe(1);
    expect(map.get("y")).toBe(2);
  });

  it("does not mutate the input array order", () => {
    const input = [
      { id: "c", payment_date: "2026-06-13" },
      { id: "a", payment_date: "2026-05-31" },
    ];
    taskPaymentLineNumbers(input);
    expect(input[0].id).toBe("c");
  });
});

describe("formatTaskPaymentRef", () => {
  it("renders 'PKG · #n'", () => {
    expect(formatTaskPaymentRef("TW-260618-001", 6)).toBe("TW-260618-001 · #6");
  });
});
