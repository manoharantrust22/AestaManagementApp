import { describe, it, expect } from "vitest";
import {
  scopeContractPresence,
  type ContractPresenceDay,
  type ContractPresenceItem,
} from "../contractPresenceUtils";

const item = (
  over: Partial<ContractPresenceItem> & { tradeCategoryId: string | null; units: number }
): ContractPresenceItem => ({
  kind: "subcontract",
  id: "id",
  title: "Contract",
  workerSummary: "",
  labourValue: 0,
  ...over,
});

function fixture(): Map<string, ContractPresenceDay> {
  const m = new Map<string, ContractPresenceDay>();
  // Day A: a "t1" item (units 3) + a "t2" item (units 2).
  m.set("2026-06-01", {
    date: "2026-06-01",
    totalUnits: 5,
    totalValue: 0,
    items: [
      item({ id: "a1", tradeCategoryId: "t1", units: 3 }),
      item({ id: "a2", tradeCategoryId: "t2", units: 2 }),
    ],
  });
  // Day B: only a "t2" item (units 4).
  m.set("2026-06-02", {
    date: "2026-06-02",
    totalUnits: 4,
    totalValue: 0,
    items: [item({ id: "b1", tradeCategoryId: "t2", units: 4 })],
  });
  return m;
}

describe("scopeContractPresence", () => {
  it("scope === null returns the SAME map reference (Civil byte-for-byte)", () => {
    const m = fixture();
    expect(scopeContractPresence(m, null)).toBe(m);
  });

  it("scopes to a trade: filters items, recomputes totalUnits, drops empty days", () => {
    const m = fixture();
    const out = scopeContractPresence(m, { tradeCategoryId: "t1" });

    // Day B had no "t1" items → dropped entirely.
    expect(out.has("2026-06-02")).toBe(false);

    // Day A kept only its single "t1" item; totalUnits recomputed to 3.
    expect(out.has("2026-06-01")).toBe(true);
    const dayA = out.get("2026-06-01")!;
    expect(dayA.items.length).toBe(1);
    expect(dayA.items[0].id).toBe("a1");
    expect(dayA.totalUnits).toBe(3);

    // Only one day in the result.
    expect(out.size).toBe(1);
  });
});
