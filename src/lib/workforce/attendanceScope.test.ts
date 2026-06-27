import { describe, it, expect } from "vitest";
import { keepScopedDay } from "./attendanceScope";

describe("keepScopedDay", () => {
  it("drops a day with no scoped activity (Civil-only day)", () => {
    expect(
      keepScopedDay({ scopedNamedCount: 0, scopedMarketCount: 0, hasContractPresence: false })
    ).toBe(false);
  });

  it("keeps a day with a scoped named labourer", () => {
    expect(
      keepScopedDay({ scopedNamedCount: 2, scopedMarketCount: 0, hasContractPresence: false })
    ).toBe(true);
  });

  it("keeps a day with scoped market labour only", () => {
    expect(
      keepScopedDay({ scopedNamedCount: 0, scopedMarketCount: 1, hasContractPresence: false })
    ).toBe(true);
  });

  it("keeps a day with contract presence only", () => {
    expect(
      keepScopedDay({ scopedNamedCount: 0, scopedMarketCount: 0, hasContractPresence: true })
    ).toBe(true);
  });
});
