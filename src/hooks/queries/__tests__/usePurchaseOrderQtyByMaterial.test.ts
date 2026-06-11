import { describe, it, expect } from "vitest";
import {
  aggregateOrderedQty,
  type POItemRecord,
} from "../usePurchaseOrderQtyByMaterial";

const SITE = "site-A";
const GROUP = "group-1";
const PARENT = "ppc-parent";
const VARIANT = "ppc-43grade";

function item(overrides: Partial<POItemRecord>): POItemRecord {
  return {
    material_id: PARENT,
    quantity: 10,
    unit: "bag",
    parent_id: null,
    po_site_id: SITE,
    po_site_group_id: null,
    ...overrides,
  };
}

const ownSet = (...ids: string[]) => new Set(ids);
const groupSet = (...ids: string[]) => new Set(ids);

describe("aggregateOrderedQty", () => {
  it("splits group vs own and totals them", () => {
    const map = aggregateOrderedQty(
      [
        item({ quantity: 100, po_site_group_id: GROUP, po_site_id: "other" }), // group
        item({ quantity: 10, po_site_group_id: null, po_site_id: SITE }), // own
      ],
      ownSet(SITE),
      groupSet(GROUP),
    );
    const ppc = map.get(PARENT)!;
    expect(ppc.group_qty).toBe(100);
    expect(ppc.own_qty).toBe(10);
    expect(ppc.total_qty).toBe(110);
    expect(ppc.unit).toBe("bag");
  });

  it("rolls a variant's order up under its parent key", () => {
    const map = aggregateOrderedQty(
      [
        item({ material_id: VARIANT, parent_id: PARENT, quantity: 5, po_site_group_id: GROUP, po_site_id: "x" }),
        item({ material_id: PARENT, parent_id: null, quantity: 20, po_site_group_id: GROUP, po_site_id: "x" }),
      ],
      ownSet(SITE),
      groupSet(GROUP),
    );
    // Both land under the parent key.
    expect(map.has(VARIANT)).toBe(false);
    expect(map.get(PARENT)!.group_qty).toBe(25);
  });

  it("ignores other sites' own POs and other groups", () => {
    const map = aggregateOrderedQty(
      [
        item({ quantity: 7, po_site_group_id: null, po_site_id: "site-B" }), // other site's own
        item({ quantity: 9, po_site_group_id: "group-2", po_site_id: "x" }), // other group
      ],
      ownSet(SITE),
      groupSet(GROUP),
    );
    expect(map.size).toBe(0);
  });

  it("a group PO is never also counted as own (no double count)", () => {
    // A group PO carries both a site_id (originator) and a site_group_id.
    const map = aggregateOrderedQty(
      [item({ quantity: 50, po_site_group_id: GROUP, po_site_id: SITE })],
      ownSet(SITE),
      groupSet(GROUP),
    );
    const ppc = map.get(PARENT)!;
    expect(ppc.group_qty).toBe(50);
    expect(ppc.own_qty).toBe(0);
    expect(ppc.total_qty).toBe(50);
  });

  it("when the site has no group, only own POs count", () => {
    const map = aggregateOrderedQty(
      [
        item({ quantity: 30, po_site_group_id: null, po_site_id: SITE }), // own
        item({ quantity: 99, po_site_group_id: GROUP, po_site_id: "x" }), // group — but site not in a group
      ],
      ownSet(SITE),
      groupSet(), // empty group scope
    );
    const ppc = map.get(PARENT)!;
    expect(ppc.own_qty).toBe(30);
    expect(ppc.group_qty).toBe(0);
    expect(ppc.total_qty).toBe(30);
  });

  it("company scope: multiple own-sites and groups aggregate together", () => {
    const map = aggregateOrderedQty(
      [
        item({ quantity: 5, po_site_group_id: null, po_site_id: "site-A" }),
        item({ quantity: 6, po_site_group_id: null, po_site_id: "site-B" }),
        item({ quantity: 7, po_site_group_id: "group-1", po_site_id: "x" }),
        item({ quantity: 8, po_site_group_id: "group-2", po_site_id: "y" }),
      ],
      ownSet("site-A", "site-B"),
      groupSet("group-1", "group-2"),
    );
    const ppc = map.get(PARENT)!;
    expect(ppc.own_qty).toBe(11);
    expect(ppc.group_qty).toBe(15);
    expect(ppc.total_qty).toBe(26);
  });

  it("coerces string/blank quantities to numbers", () => {
    const map = aggregateOrderedQty(
      [
        item({ quantity: "12.5" as unknown as number, po_site_id: SITE }),
        item({ quantity: null, po_site_id: SITE }),
      ],
      ownSet(SITE),
      groupSet(),
    );
    expect(map.get(PARENT)!.own_qty).toBe(12.5);
  });
});
