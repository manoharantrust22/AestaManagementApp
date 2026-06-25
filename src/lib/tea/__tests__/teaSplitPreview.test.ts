import { describe, it, expect } from "vitest";
import { computeTeaSplitPreview } from "../teaSplitPreview";

const trades = [
  { id: "civil", name: "Civil", teaMode: "pool" as const, poolHost: "civil" },
  { id: "paint", name: "Painting", teaMode: "pool" as const, poolHost: "civil" },
  { id: "elec", name: "Electrical", teaMode: "off" as const, poolHost: "elec" },
];

describe("computeTeaSplitPreview", () => {
  it("splits a pool's tea by present units across member trades", () => {
    const out = computeTeaSplitPreview({
      defaultHost: "civil",
      trades,
      sites: [
        {
          siteId: "s1",
          poolHost: "civil",
          amount: 300,
          unitsByTrade: { civil: 2, paint: 1, elec: 5 }, // elec is off -> ignored
        },
      ],
    });
    const s1 = out.find((x) => x.siteId === "s1")!;
    const civil = s1.perTrade.find((p) => p.tradeCategoryId === "civil")!;
    const paint = s1.perTrade.find((p) => p.tradeCategoryId === "paint")!;
    expect(civil.amount).toBe(200);
    expect(paint.amount).toBe(100);
    expect(s1.perTrade.some((p) => p.tradeCategoryId === "elec")).toBe(false);
    expect(civil.amount + paint.amount).toBe(300); // conserved
  });
  it("gives the host the whole bill when no one worked", () => {
    const out = computeTeaSplitPreview({
      defaultHost: "civil",
      trades,
      sites: [{ siteId: "s1", poolHost: "civil", amount: 120, unitsByTrade: {} }],
    });
    const civil = out[0].perTrade.find((p) => p.tradeCategoryId === "civil")!;
    expect(civil.amount).toBe(120);
  });
  it("conserves an indivisible split (no penny leak)", () => {
    const t3 = [
      { id: "a", name: "A", teaMode: "pool" as const, poolHost: "a" },
      { id: "b", name: "B", teaMode: "pool" as const, poolHost: "a" },
      { id: "c", name: "C", teaMode: "pool" as const, poolHost: "a" },
    ];
    const out = computeTeaSplitPreview({
      defaultHost: "a",
      trades: t3,
      sites: [{ siteId: "s1", poolHost: "a", amount: 100, unitsByTrade: { a: 1, b: 1, c: 1 } }],
    });
    const shares = out[0].perTrade;
    expect(shares.length).toBe(3);
    expect(shares.reduce((s, p) => s + p.amount, 0)).toBe(100); // exact, no leak
  });
});
