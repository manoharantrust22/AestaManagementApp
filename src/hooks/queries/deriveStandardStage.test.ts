import { describe, it, expect } from "vitest";
import { deriveStandardStage } from "./useMaterialThreads";

// deriveStandardStage only reads mr.status, po.status, settlement.is_paid plus the
// numeric inventory signals — build minimal fixtures and cast.
const mr = (status: string) => ({ status }) as any;
const po = (status: string) => ({ status }) as any;
const paid = { is_paid: true } as any;

describe("deriveStandardStage — exhaustion vs in-use vs settled", () => {
  it("marks a settled+delivered batch-scoped row that is EMPTY as exhausted, even with zero usage txns", () => {
    // Regression: legacy/backfilled batches drain current_qty to 0 without writing
    // any usage stock_transactions, so inventoryUsed===0. Requiring used>0 left these
    // stuck at "settled" → IN USE rendered as a pulsing "next" step while the button
    // read "All clear". A batch-scoped row exists only because a delivery landed, so
    // remaining<=0 means fully consumed.
    expect(
      deriveStandardStage(mr("approved"), po("delivered"), paid, 0, 0, true)
    ).toBe("exhausted");
  });

  it("still exhausted when usage WAS recorded (used>0, remaining 0)", () => {
    expect(
      deriveStandardStage(mr("approved"), po("delivered"), paid, 3, 0, true)
    ).toBe("exhausted");
  });

  it("is in-use while a batch still has stock and some was used", () => {
    expect(
      deriveStandardStage(mr("approved"), po("delivered"), paid, 1, 2, true)
    ).toBe("in-use");
  });

  it("stays settled when stock remains but nothing has been used yet", () => {
    expect(
      deriveStandardStage(mr("approved"), po("delivered"), paid, 0, 5, true)
    ).toBe("settled");
  });

  it("does NOT mark a shared-pool match (not batch-scoped) exhausted on remaining 0 with no usage", () => {
    // Conservative: an own-pool bucket transiently at 0 with no usage txns is
    // ambiguous, so leave it at "settled" rather than risk a false "exhausted".
    expect(
      deriveStandardStage(mr("approved"), po("delivered"), paid, 0, 0, false)
    ).toBe("settled");
  });

  it("a shared-pool match WITH usage and empty still reads exhausted (unchanged behavior)", () => {
    expect(
      deriveStandardStage(mr("approved"), po("delivered"), paid, 4, 0, false)
    ).toBe("exhausted");
  });
});
