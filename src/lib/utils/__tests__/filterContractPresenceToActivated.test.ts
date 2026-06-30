import { describe, it, expect } from "vitest";
import {
  filterContractPresenceToActivated,
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
  ...over,
});

function fixture(): Map<string, ContractPresenceDay> {
  const m = new Map<string, ContractPresenceDay>();
  // Day A: an activated "t1" item (units 3) + a deactivated "t2" item (units 2).
  m.set("2026-06-01", {
    date: "2026-06-01",
    totalUnits: 5,
    items: [
      item({ id: "a1", tradeCategoryId: "t1", units: 3 }),
      item({ id: "a2", tradeCategoryId: "t2", units: 2 }),
    ],
  });
  // Day B: only a deactivated "t2" item (units 4).
  m.set("2026-06-02", {
    date: "2026-06-02",
    totalUnits: 4,
    items: [item({ id: "b1", tradeCategoryId: "t2", units: 4 })],
  });
  // Day C: an uncategorised (null trade) item (units 1).
  m.set("2026-06-03", {
    date: "2026-06-03",
    totalUnits: 1,
    items: [item({ id: "c1", tradeCategoryId: null, units: 1 })],
  });
  return m;
}

describe("filterContractPresenceToActivated", () => {
  it("undefined deactivated set returns the SAME map reference (loading byte-for-byte)", () => {
    const m = fixture();
    expect(filterContractPresenceToActivated(m, undefined)).toBe(m);
  });

  it("empty deactivated set returns the SAME map reference (nothing OFF)", () => {
    const m = fixture();
    expect(filterContractPresenceToActivated(m, new Set())).toBe(m);
  });

  it("drops items of an explicitly-deactivated trade and recomputes totalUnits", () => {
    const m = fixture();
    const out = filterContractPresenceToActivated(m, new Set(["t2"]));

    // Day A kept only its activated "t1" item; totalUnits recomputed to 3.
    expect(out.has("2026-06-01")).toBe(true);
    const dayA = out.get("2026-06-01")!;
    expect(dayA.items.length).toBe(1);
    expect(dayA.items[0].id).toBe("a1");
    expect(dayA.totalUnits).toBe(3);

    // Day B was entirely "t2" → dropped.
    expect(out.has("2026-06-02")).toBe(false);
  });

  it("keeps uncategorised (null trade) items even when other trades are OFF", () => {
    const m = fixture();
    const out = filterContractPresenceToActivated(m, new Set(["t2"]));
    expect(out.has("2026-06-03")).toBe(true);
    expect(out.get("2026-06-03")!.items[0].id).toBe("c1");
  });
});
