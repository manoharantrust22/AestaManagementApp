import { describe, it, expect } from "vitest";
import { holidayInScope } from "../holidayUtils";

describe("holidayInScope", () => {
  // Model: trade_category_id NULL = "all workspaces" (shows everywhere);
  // a category id = that workspace only. Civil is a real scope (its own id).
  const allWorkspaces = { trade_category_id: null };
  const civil = { trade_category_id: "civil" };
  const painting = { trade_category_id: "paint" };

  it("degenerate null scope (Civil id unresolved) sees only all-workspaces rows", () => {
    expect(holidayInScope(allWorkspaces, null)).toBe(true);
    expect(holidayInScope(painting, null)).toBe(false);
    expect(holidayInScope(civil, null)).toBe(false);
  });

  it("Civil view sees all-workspaces + Civil's own, not other trades", () => {
    expect(holidayInScope(allWorkspaces, "civil")).toBe(true);
    expect(holidayInScope(civil, "civil")).toBe(true);
    expect(holidayInScope(painting, "civil")).toBe(false);
  });

  it("a trade workspace sees all-workspaces + its own, NOT Civil's", () => {
    expect(holidayInScope(allWorkspaces, "paint")).toBe(true);
    expect(holidayInScope(painting, "paint")).toBe(true);
    expect(holidayInScope(civil, "paint")).toBe(false); // Civil no longer leaks into Painting
  });
});
