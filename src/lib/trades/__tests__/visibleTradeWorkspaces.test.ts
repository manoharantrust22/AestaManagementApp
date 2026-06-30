import { describe, it, expect } from "vitest";
import {
  isTrackedContract,
  visibleTradeWorkspaces,
  hasNonCivilWorkspace,
} from "../visibleTradeWorkspaces";
import type {
  Trade,
  TradeCategory,
  TradeContract,
  LaborTrackingMode,
} from "@/types/trade.types";

// ── Fixture builders (mirrors TradeChipFilter.workspace.test.tsx) ──────────────
function contract(
  id: string,
  categoryId: string,
  mode: LaborTrackingMode = "detailed",
): TradeContract {
  return {
    id,
    siteId: "s1",
    tradeCategoryId: categoryId,
    stageId: null,
    title: `${categoryId} In-house`,
    laborTrackingMode: mode,
    isInHouse: true,
    contractType: "mesthri",
    status: "active",
    totalValue: 0,
    workProgressPercent: null,
    teamId: null,
    laborerId: null,
    mesthriOrSpecialistName: null,
    parentSubcontractId: null,
    createdAt: "",
  };
}

function trade(
  category: Partial<TradeCategory> & { id: string; name: string },
  contracts: TradeContract[],
): Trade {
  return {
    category: { isSystemSeed: false, isActive: true, hasWorkspace: true, ...category },
    contracts,
  };
}

describe("isTrackedContract", () => {
  it("is true only for detailed mode", () => {
    expect(isTrackedContract(contract("c", "x", "detailed"))).toBe(true);
    expect(isTrackedContract(contract("c", "x", "headcount"))).toBe(false);
    expect(isTrackedContract(contract("c", "x", "mesthri_only"))).toBe(false);
    expect(isTrackedContract(contract("c", "x", "mid"))).toBe(false);
  });
});

describe("visibleTradeWorkspaces", () => {
  it("always includes Civil, even with no contracts or hasWorkspace=false", () => {
    const out = visibleTradeWorkspaces([
      trade({ id: "civ", name: "Civil", hasWorkspace: false }, []),
    ]);
    expect(out.map((t) => t.category.name)).toEqual(["Civil"]);
  });

  it("EXCLUDES a non-Civil trade whose workspace is OFF even with a detailed contract", () => {
    const out = visibleTradeWorkspaces([
      trade({ id: "civ", name: "Civil" }, [contract("civ-c", "civ")]),
      trade({ id: "elec", name: "Electrical", hasWorkspace: false }, [contract("elec-c", "elec")]),
      trade({ id: "plumb", name: "Plumbing", hasWorkspace: true }, [contract("plumb-c", "plumb")]),
    ]);
    expect(out.map((t) => t.category.name).sort()).toEqual(["Civil", "Plumbing"]);
  });

  it("treats hasWorkspace=undefined as ON", () => {
    const out = visibleTradeWorkspaces([
      trade({ id: "paint", name: "Painting", hasWorkspace: undefined }, [contract("p-c", "paint")]),
    ]);
    expect(out.map((t) => t.category.name)).toContain("Painting");
  });

  it("EXCLUDES a workspace-ON trade that has only headcount/mesthri contracts", () => {
    const out = visibleTradeWorkspaces([
      trade({ id: "fab", name: "Fabrication", hasWorkspace: true }, [
        contract("f1", "fab", "headcount"),
        contract("f2", "fab", "mesthri_only"),
      ]),
    ]);
    expect(out).toHaveLength(0);
  });

  it("narrows returned contracts to detailed-only (drives the (N) badge + nav target)", () => {
    const out = visibleTradeWorkspaces([
      trade({ id: "plumb", name: "Plumbing" }, [
        contract("p-detailed", "plumb", "detailed"),
        contract("p-headcount", "plumb", "headcount"),
      ]),
    ]);
    expect(out[0].contracts).toHaveLength(1);
    expect(out[0].contracts[0].id).toBe("p-detailed");
  });
});

describe("hasNonCivilWorkspace", () => {
  it("is false when only Civil qualifies", () => {
    expect(
      hasNonCivilWorkspace([
        trade({ id: "civ", name: "Civil" }, [contract("civ-c", "civ")]),
        trade({ id: "elec", name: "Electrical", hasWorkspace: false }, [contract("e", "elec")]),
      ]),
    ).toBe(false);
  });

  it("is true when a non-Civil workspace trade qualifies", () => {
    expect(
      hasNonCivilWorkspace([
        trade({ id: "civ", name: "Civil" }, [contract("civ-c", "civ")]),
        trade({ id: "plumb", name: "Plumbing" }, [contract("p-c", "plumb")]),
      ]),
    ).toBe(true);
  });

  it("handles undefined input", () => {
    expect(hasNonCivilWorkspace(undefined)).toBe(false);
  });
});
