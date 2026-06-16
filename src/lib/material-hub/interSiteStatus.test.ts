import { describe, it, expect } from "vitest";
import {
  deriveInterSiteStatus,
  isInterSiteOutstanding,
} from "./interSiteStatus";

describe("deriveInterSiteStatus", () => {
  it("returns 'none' when there are no cross-site rows", () => {
    expect(deriveInterSiteStatus([])).toBe("none");
  });

  it("returns 'pending_usage' when a row has not been put into a settlement", () => {
    expect(deriveInterSiteStatus(["pending"])).toBe("pending_usage");
  });

  it("returns 'raised_unpaid' when a settlement was generated but not paid", () => {
    expect(deriveInterSiteStatus(["in_settlement"])).toBe("raised_unpaid");
  });

  it("returns 'settled' only when every cross-site row is settled", () => {
    expect(deriveInterSiteStatus(["settled"])).toBe("settled");
    expect(deriveInterSiteStatus(["settled", "settled"])).toBe("settled");
  });

  it("prioritises an un-raised pending row over a raised one", () => {
    expect(deriveInterSiteStatus(["in_settlement", "pending"])).toBe("pending_usage");
  });

  it("treats a generated-but-unpaid batch as raised, not settled", () => {
    // The exact bug: Generate flips one leg to in_settlement; the batch must
    // NOT read as settled just because no 'pending' rows remain.
    expect(deriveInterSiteStatus(["in_settlement", "settled"])).toBe("raised_unpaid");
  });

  it("isInterSiteOutstanding is true for pending_usage and raised_unpaid only", () => {
    expect(isInterSiteOutstanding("none")).toBe(false);
    expect(isInterSiteOutstanding("pending_usage")).toBe(true);
    expect(isInterSiteOutstanding("raised_unpaid")).toBe(true);
    expect(isInterSiteOutstanding("settled")).toBe(false);
  });
});
