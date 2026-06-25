import { describe, it, expect } from "vitest";
import { holidayInScope } from "../holidayUtils";

describe("holidayInScope", () => {
  const sitewide = { trade_category_id: null };
  const painting = { trade_category_id: "paint" };
  it("site view (no scope) sees only whole-site holidays", () => {
    expect(holidayInScope(sitewide, null)).toBe(true);
    expect(holidayInScope(painting, null)).toBe(false);
  });
  it("a trade workspace sees whole-site + its own", () => {
    expect(holidayInScope(sitewide, "paint")).toBe(true);
    expect(holidayInScope(painting, "paint")).toBe(true);
    expect(holidayInScope(painting, "civil")).toBe(false);
  });
});
