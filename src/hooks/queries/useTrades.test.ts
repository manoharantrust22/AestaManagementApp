import { describe, it, expect } from "vitest";
import { groupContractsByTrade } from "./useTrades";
import type { TradeCategory, TradeContract } from "@/types/trade.types";

const civilCat: TradeCategory = {
  id: "c1",
  name: "Civil",
  isSystemSeed: true,
  isActive: true,
};
const paintCat: TradeCategory = {
  id: "p1",
  name: "Painting",
  isSystemSeed: true,
  isActive: true,
};
const tileCat: TradeCategory = {
  id: "t1",
  name: "Tiling",
  isSystemSeed: true,
  isActive: true,
};

const mkContract = (
  id: string,
  tradeCategoryId: string,
  isInHouse = false
): TradeContract => ({
  id,
  siteId: "s1",
  tradeCategoryId,
  title: id,
  laborTrackingMode: "detailed",
  isInHouse,
  contractType: "mesthri",
  status: "active",
  totalValue: 0,
  mesthriOrSpecialistName: null,
  createdAt: "2026-05-02T00:00:00Z",
});

describe("groupContractsByTrade", () => {
  it("returns one Trade per category, including categories with no contracts", () => {
    const result = groupContractsByTrade(
      [civilCat, paintCat, tileCat],
      [mkContract("k1", "c1", true), mkContract("k2", "p1")]
    );
    expect(result).toHaveLength(3);
    expect(result.map((t) => t.category.name)).toEqual([
      "Civil",
      "Painting",
      "Tiling",
    ]);
    expect(result[0].contracts).toHaveLength(1);
    expect(result[1].contracts).toHaveLength(1);
    expect(result[2].contracts).toHaveLength(0);
  });

  it("places Civil first regardless of input order", () => {
    const result = groupContractsByTrade(
      [paintCat, civilCat],
      [mkContract("k1", "c1", true), mkContract("k2", "p1")]
    );
    expect(result[0].category.name).toBe("Civil");
  });

  it("excludes inactive categories that have no contracts", () => {
    const inactive: TradeCategory = { ...tileCat, isActive: false };
    const result = groupContractsByTrade([civilCat, inactive], []);
    expect(result.map((t) => t.category.name)).toEqual(["Civil"]);
  });

  it("includes inactive categories that still have active contracts", () => {
    const inactive: TradeCategory = { ...tileCat, isActive: false };
    const result = groupContractsByTrade(
      [civilCat, inactive],
      [mkContract("legacy", "t1")]
    );
    expect(result.map((t) => t.category.name)).toEqual(["Civil", "Tiling"]);
  });

  it("filters out contracts whose tradeCategoryId is null (legacy unmigrated)", () => {
    const orphan = { ...mkContract("orphan", "c1"), tradeCategoryId: null };
    const result = groupContractsByTrade([civilCat], [orphan]);
    expect(result[0].contracts).toHaveLength(0);
  });
});
