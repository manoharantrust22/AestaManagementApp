import { describe, it, expect } from "vitest";
import { scopedLaborerIds, isLaborerInTradeScope } from "./laborerScope";

const labs = [
  { id: "a", category_id: "civil" },
  { id: "b", category_id: "paint" },
  { id: "c", category_id: null },
  { id: "d", category_id: "paint" },
];

describe("laborerScope", () => {
  it("includes labourers of the trade", () => {
    const s = scopedLaborerIds({ laborers: labs, tradeCategoryId: "paint", historicallyAttendedIds: [] });
    expect([...s].sort()).toEqual(["b", "d"]);
  });
  it("unions historically-attended labourers (even of other/blank trades) so none disappear", () => {
    const s = scopedLaborerIds({ laborers: labs, tradeCategoryId: "paint", historicallyAttendedIds: ["c", "a"] });
    expect([...s].sort()).toEqual(["a", "b", "c", "d"]);
  });
  it("isLaborerInTradeScope reflects membership", () => {
    const s = scopedLaborerIds({ laborers: labs, tradeCategoryId: "civil", historicallyAttendedIds: [] });
    expect(isLaborerInTradeScope(s, "a")).toBe(true);
    expect(isLaborerInTradeScope(s, "b")).toBe(false);
  });
});
