import { describe, it, expect } from "vitest";
import { sumSharesByDate } from "../useTradeTeaShare";

describe("sumSharesByDate", () => {
  it("sums share amounts per date", () => {
    const rows = [
      { date: "2026-06-01", amount: 100 },
      { date: "2026-06-01", amount: 50 },
      { date: "2026-06-02", amount: 75 },
    ];
    const m = sumSharesByDate(rows);
    expect(m.get("2026-06-01")).toBe(150);
    expect(m.get("2026-06-02")).toBe(75);
  });
  it("is empty for no rows", () => {
    expect(sumSharesByDate([]).size).toBe(0);
  });
});
