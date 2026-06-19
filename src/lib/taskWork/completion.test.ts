import { describe, it, expect } from "vitest";
import { buildCompletionUpdate, buildReopenUpdate } from "./completion";

describe("buildCompletionUpdate", () => {
  it("no_balance: clears reason, not waived, stamps end date when missing", () => {
    const u = buildCompletionUpdate({
      choice: "no_balance",
      reason: "ignored",
      actualEndDate: null,
      today: "2026-06-19",
    });
    expect(u).toEqual({
      status: "completed",
      completion_reason: null,
      balance_waived: false,
      actual_end_date: "2026-06-19",
    });
  });

  it("waive: trims reason, sets balance_waived true", () => {
    const u = buildCompletionUpdate({
      choice: "waive",
      reason: "  bargained to 37k  ",
      actualEndDate: null,
      today: "2026-06-19",
    });
    expect(u.balance_waived).toBe(true);
    expect(u.completion_reason).toBe("bargained to 37k");
  });

  it("owe: keeps reason, not waived", () => {
    const u = buildCompletionUpdate({
      choice: "owe",
      reason: "will pay next week",
      actualEndDate: null,
      today: "2026-06-19",
    });
    expect(u.balance_waived).toBe(false);
    expect(u.completion_reason).toBe("will pay next week");
  });

  it("does not overwrite an existing end date", () => {
    const u = buildCompletionUpdate({
      choice: "owe",
      reason: "x",
      actualEndDate: "2026-06-01",
      today: "2026-06-19",
    });
    expect(u.actual_end_date).toBeUndefined();
  });

  it("empty reason normalises to null", () => {
    const u = buildCompletionUpdate({
      choice: "owe",
      reason: "   ",
      actualEndDate: "2026-06-01",
      today: "2026-06-19",
    });
    expect(u.completion_reason).toBeNull();
  });
});

describe("buildReopenUpdate", () => {
  it("reactivates and clears the waiver + reason", () => {
    expect(buildReopenUpdate()).toEqual({
      status: "active",
      balance_waived: false,
      completion_reason: null,
    });
  });
});
