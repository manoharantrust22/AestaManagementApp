import { describe, it, expect } from "vitest";
import {
  nextSortOrder,
  buildCustomSourceRow,
  reorderVisible,
  isLastVisibleSource,
} from "./payerSourceAdmin";
import type { PayerSourceRow } from "@/hooks/queries/usePayerSources";

function row(p: Partial<PayerSourceRow> & { id: string }): PayerSourceRow {
  return {
    id: p.id,
    site_id: p.site_id ?? "site-1",
    key: p.key ?? p.id,
    label: p.label ?? p.id,
    icon: p.icon ?? null,
    color: p.color ?? null,
    sort_order: p.sort_order ?? 0,
    requires_name: p.requires_name ?? false,
    is_built_in: p.is_built_in ?? false,
    is_hidden: p.is_hidden ?? false,
  };
}

describe("nextSortOrder", () => {
  it("starts at 10 for an empty site", () => {
    expect(nextSortOrder([])).toBe(10);
  });
  it("is max + 10 otherwise", () => {
    expect(nextSortOrder([{ sort_order: 10 }, { sort_order: 20 }])).toBe(30);
    expect(nextSortOrder([{ sort_order: 999 }])).toBe(1009);
  });
});

describe("buildCustomSourceRow", () => {
  it("builds a non-built-in, visible row with a derived key and trimmed label", () => {
    const built = buildCustomSourceRow({
      siteId: "site-1",
      label: "  Site Cash ",
      existingRows: [{ key: "own_money", sort_order: 10 }],
    });
    expect(built).toEqual({
      site_id: "site-1",
      key: "site_cash",
      label: "Site Cash",
      requires_name: false,
      is_built_in: false,
      is_hidden: false,
      sort_order: 20,
    });
  });

  it("dedupes the key against existing keys and honours requiresName", () => {
    const built = buildCustomSourceRow({
      siteId: "site-1",
      label: "Site Cash",
      requiresName: true,
      existingRows: [{ key: "site_cash", sort_order: 999 }],
    });
    expect(built.key).toBe("site_cash_2");
    expect(built.requires_name).toBe(true);
    expect(built.sort_order).toBe(1009);
  });
});

describe("reorderVisible", () => {
  const rows = [
    row({ id: "A", sort_order: 10 }),
    row({ id: "B", sort_order: 20 }),
    row({ id: "C", sort_order: 30 }),
  ];

  it("moving B up swaps it above A and returns only changed rows", () => {
    const out = reorderVisible(rows, "B", "up");
    expect(out).toEqual([
      { id: "B", sort_order: 10 },
      { id: "A", sort_order: 20 },
    ]);
  });

  it("returns null when already at the top edge", () => {
    expect(reorderVisible(rows, "A", "up")).toBeNull();
  });

  it("returns null when already at the bottom edge", () => {
    expect(reorderVisible(rows, "C", "down")).toBeNull();
  });

  it("returns null for an unknown id", () => {
    expect(reorderVisible(rows, "Z", "up")).toBeNull();
  });

  it("ignores hidden rows when computing adjacency and renumbering", () => {
    const withHidden = [
      row({ id: "A", sort_order: 10 }),
      row({ id: "B", sort_order: 20 }),
      row({ id: "H", sort_order: 25, is_hidden: true }),
      row({ id: "C", sort_order: 30 }),
    ];
    const out = reorderVisible(withHidden, "C", "up");
    // visible order A,B,C -> move C up -> A,C,B -> renumber 10,20,30
    expect(out).toEqual([
      { id: "C", sort_order: 20 },
      { id: "B", sort_order: 30 },
    ]);
  });
});

describe("isLastVisibleSource", () => {
  it("is true when the row is the only visible one", () => {
    const rows = [
      row({ id: "A", is_hidden: false }),
      row({ id: "B", is_hidden: true }),
    ];
    expect(isLastVisibleSource(rows, "A")).toBe(true);
  });
  it("is false when other visible rows remain", () => {
    const rows = [row({ id: "A" }), row({ id: "B" })];
    expect(isLastVisibleSource(rows, "A")).toBe(false);
  });
  it("is false for a hidden row", () => {
    const rows = [row({ id: "A" }), row({ id: "B", is_hidden: true })];
    expect(isLastVisibleSource(rows, "B")).toBe(false);
  });
});
