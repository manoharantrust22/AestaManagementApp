import { describe, it, expect } from "vitest";
import { calculateSpentToDate, calculateExpectedRemaining, calculateDailyBurnRate } from "../rentalCostUtils";

const dateStr = (daysAgo: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
};
const futureDateStr = (daysFromNow: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
};

const makeItem = (qty: number, rate: number, qtyReturned = 0) => ({
  id: "item-1",
  quantity: qty,
  daily_rate_actual: rate,
  quantity_returned: qtyReturned,
  quantity_outstanding: qty - qtyReturned,
});

describe("calculateSpentToDate", () => {
  it("computes cost for fully outstanding items", () => {
    const items = [makeItem(50, 8, 0), makeItem(30, 5, 0)];
    const startDate = dateStr(18);
    // 50 × 8 × 18 = 7,200  |  30 × 5 × 18 = 2,700  → 9,900
    const result = calculateSpentToDate(items as any, [], startDate);
    expect(result).toBe(9900);
  });

  it("includes returned item cost up to return date", () => {
    const startDate = dateStr(18);
    const returnDate = dateStr(10); // returned 10 days ago = used for 8 days
    const items = [makeItem(50, 8, 20)];
    const returns = [
      { rental_order_item_id: "item-1", quantity_returned: 20, return_date: returnDate, condition: "good" as const, id: "r1", rental_order_id: "o1", created_at: "", created_by: "" },
    ];
    // Outstanding 30 × 8 × 18 = 4,320
    // Returned 20 × 8 × (18-10) = 20 × 8 × 8 = 1,280
    // Total = 5,600
    const result = calculateSpentToDate(items as any, returns as any, startDate);
    expect(result).toBe(5600);
  });

  it("returns 0 for empty items", () => {
    expect(calculateSpentToDate([], [], dateStr(5))).toBe(0);
  });
});

describe("calculateExpectedRemaining", () => {
  it("computes remaining cost for outstanding items", () => {
    const items = [makeItem(50, 8, 0), makeItem(30, 5, 0)];
    const startDate = dateStr(18);
    const expectedReturn = futureDateStr(7);
    // 50 × 8 × 7 = 2,800  |  30 × 5 × 7 = 1,050  → 3,850
    const result = calculateExpectedRemaining(items as any, startDate, expectedReturn);
    expect(result).toBe(3850);
  });

  it("returns 0 when expected return date is in the past (overdue)", () => {
    const items = [makeItem(50, 8, 0)];
    const result = calculateExpectedRemaining(items as any, dateStr(30), dateStr(5));
    expect(result).toBe(0);
  });
});

describe("calculateDailyBurnRate", () => {
  it("returns spent / days elapsed", () => {
    expect(calculateDailyBurnRate(9900, 18)).toBe(550);
  });
  it("returns 0 when daysElapsed is 0", () => {
    expect(calculateDailyBurnRate(9900, 0)).toBe(0);
  });
});
