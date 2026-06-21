import { describe, it, expect } from "vitest";
import { buildWorkspaceModel, computeInitials, findTask } from "./workspaceModel";
import type {
  ContractReconciliation,
  Trade,
  TradeContract,
  WorkStage,
} from "@/types/trade.types";

function contract(over: Partial<TradeContract>): TradeContract {
  return {
    id: "c1",
    siteId: "s1",
    tradeCategoryId: "civil",
    stageId: null,
    title: "Task",
    laborTrackingMode: "headcount",
    isInHouse: false,
    contractType: "mesthri",
    status: "active",
    totalValue: 100000,
    workProgressPercent: null,
    teamId: null,
    laborerId: null,
    mesthriOrSpecialistName: "Karthik",
    createdAt: "2026-01-01",
    ...over,
  };
}

const civilCat = { id: "civil", name: "Civil", isSystemSeed: true, isActive: true };

describe("computeInitials", () => {
  it("uses first+last initials for multi-word names", () => {
    expect(computeInitials("Karthik Murugan")).toBe("KM");
  });
  it("uses first two letters for single names", () => {
    expect(computeInitials("Anbu")).toBe("AN");
  });
  it("handles empty gracefully", () => {
    expect(computeInitials("   ")).toBe("?");
  });
});

describe("buildWorkspaceModel", () => {
  const stages: WorkStage[] = [
    { id: "st1", siteId: "s1", tradeCategoryId: "civil", name: "First Floor", sortOrder: 0, createdAt: "2026-01-01" },
  ];

  const trades: Trade[] = [
    {
      category: civilCat,
      contracts: [
        // Distinct teamIds so c2/c3 stay ungrouped singletons (contractor grouping tested separately).
        contract({ id: "c1", stageId: "st1", workProgressPercent: 30, title: "Slab", teamId: "tA" }),
        contract({ id: "c2", stageId: null, workProgressPercent: 60, title: "Plaster", teamId: "tB" }),
        contract({ id: "c3", stageId: "ghost", workProgressPercent: null, title: "Untracked", teamId: "tC" }),
      ],
    },
  ];

  const reconciliations = new Map<string, ContractReconciliation>([
    ["c1", recon("c1", 100000, 60000)], // 30% done -> exposure +30000 high
    ["c2", recon("c2", 100000, 40000)], // 60% done -> exposure -20000 safe
    ["c3", recon("c3", 80000, 20000)], // untracked
  ]);

  function recon(id: string, quoted: number, paid: number): ContractReconciliation {
    return {
      subcontractId: id,
      quotedAmount: quoted,
      amountPaid: paid,
      amountPaidSubcontractPayments: paid,
      amountPaidSettlements: 0,
      impliedLaborValueDetailed: 0,
      impliedLaborValueHeadcount: 0,
    };
  }

  const model = buildWorkspaceModel({
    trades,
    reconciliations,
    activity: undefined,
    stages,
  });

  it("produces one trade node with correct grouping", () => {
    expect(model.trades).toHaveLength(1);
    const node = model.trades[0];
    expect(node.stageGroups).toHaveLength(1);
    expect(node.stageGroups[0].stage.name).toBe("First Floor");
    expect(node.stageGroups[0].tasks.map((t) => t.id)).toEqual(["c1"]);
    // c2 (no stage) and c3 (unknown stage id) fall into ungrouped
    expect(node.ungrouped.map((t) => t.id).sort()).toEqual(["c2", "c3"]);
  });

  it("computes per-task exposure and severity", () => {
    const c1 = findTask(model, "c1")!;
    expect(c1.exposure.exposure).toBe(30000);
    expect(c1.exposure.severity).toBe("high");
    const c2 = findTask(model, "c2")!;
    expect(c2.exposure.exposure).toBe(-20000);
    expect(c2.exposure.severity).toBe("safe");
    const c3 = findTask(model, "c3")!;
    expect(c3.exposure.severity).toBe("untracked");
  });

  it("maps party + initials from contract", () => {
    const c1 = findTask(model, "c1")!;
    expect(c1.party).toBe("Mesthri team");
    expect(c1.initials).toBe("KA"); // Karthik
  });

  it("rolls up the site excluding untracked from exposure aggregates", () => {
    // tracked: c1 (+30000) and c2 (-20000) -> exposure +10000, atRisk 30000
    expect(model.site.exposure).toBe(10000);
    expect(model.site.atRisk).toBe(30000);
    expect(model.site.paid).toBe(120000); // 60k + 40k + 20k (all)
    expect(model.site.untrackedCount).toBe(1);
  });

  it("leaves contractorGroups empty when no contractor shares 2+ task works", () => {
    expect(model.trades[0].contractorGroups).toHaveLength(0);
  });
});

describe("buildWorkspaceModel — contractor grouping", () => {
  const build = (contracts: TradeContract[]) =>
    buildWorkspaceModel({
      trades: [{ category: civilCat, contracts }],
      reconciliations: undefined,
      activity: undefined,
      stages: [],
    }).trades[0];

  it("clusters 2+ stageless task works that share a team into one group", () => {
    const node = build([
      contract({ id: "a", title: "Ground", teamId: "jithin", totalValue: 500000 }),
      contract({ id: "b", title: "First", teamId: "jithin", totalValue: 700000 }),
      contract({ id: "solo", title: "Solo", teamId: "other", totalValue: 100000 }),
    ]);
    expect(node.contractorGroups).toHaveLength(1);
    const g = node.contractorGroups[0];
    expect(g.who).toBe("Karthik"); // leader name from the contract fixture
    expect(g.tasks.map((t) => t.id).sort()).toEqual(["a", "b"]);
    expect(g.rollup.quoted).toBe(1200000); // combined contract value
    // the single-task contractor stays flat
    expect(node.ungrouped.map((t) => t.id)).toEqual(["solo"]);
  });

  it("groups by laborerId, then by name, when there is no team", () => {
    const byLaborer = build([
      contract({ id: "l1", laborerId: "lab-1" }),
      contract({ id: "l2", laborerId: "lab-1" }),
    ]);
    expect(byLaborer.contractorGroups).toHaveLength(1);
    expect(byLaborer.contractorGroups[0].tasks.map((t) => t.id).sort()).toEqual([
      "l1",
      "l2",
    ]);

    const byName = build([
      contract({ id: "n1", mesthriOrSpecialistName: "Anbu" }),
      contract({ id: "n2", mesthriOrSpecialistName: "Anbu" }),
    ]);
    expect(byName.contractorGroups).toHaveLength(1);
  });

  it("does not merge different identity types that happen to share a value", () => {
    const node = build([
      contract({ id: "t", teamId: "x", laborerId: null }),
      contract({ id: "l", teamId: null, laborerId: "x" }),
    ]);
    // team:x and lab:x are different keys -> two singletons, no group
    expect(node.contractorGroups).toHaveLength(0);
    expect(node.ungrouped.map((t) => t.id).sort()).toEqual(["l", "t"]);
  });
});
