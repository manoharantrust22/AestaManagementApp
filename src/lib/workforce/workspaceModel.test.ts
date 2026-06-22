import { describe, it, expect } from "vitest";
import {
  buildWorkspaceModel,
  computeInitials,
  findGroup,
  findParentContract,
  findTask,
  groupSelectionKey,
} from "./workspaceModel";
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
    parentSubcontractId: null,
    createdAt: "2026-01-01",
    ...over,
  };
}

const civilCat = { id: "civil", name: "Civil", isSystemSeed: true, isActive: true };

function recon(over: Partial<ContractReconciliation> & { subcontractId: string }): ContractReconciliation {
  return {
    quotedAmount: 0,
    amountPaid: 0,
    amountPaidSubcontractPayments: 0,
    amountPaidSettlements: 0,
    impliedLaborValueDetailed: 0,
    impliedLaborValueHeadcount: 0,
    ...over,
  };
}

describe("real parent contracts (buildWorkspaceModel)", () => {
  it("folds children under the parent, keeps the parent's value, and sums paid", () => {
    const parent = contract({ id: "P", title: "Jithin Civil contract", teamId: "tJ", totalValue: 300000 });
    const c1 = contract({ id: "C1", title: "Ground Floor", teamId: "tJ", totalValue: 100000, parentSubcontractId: "P" });
    const c2 = contract({ id: "C2", title: "1st Floor", teamId: "tJ", totalValue: 200000, parentSubcontractId: "P" });
    // After "move records" the parent holds all the paid; children read zero.
    const reconciliations = new Map<string, ContractReconciliation>([
      ["P", recon({ subcontractId: "P", quotedAmount: 300000, amountPaid: 150000 })],
      ["C1", recon({ subcontractId: "C1", quotedAmount: 100000, amountPaid: 0 })],
      ["C2", recon({ subcontractId: "C2", quotedAmount: 200000, amountPaid: 0 })],
    ]);
    const trades: Trade[] = [{ category: civilCat, contracts: [parent, c1, c2] }];
    const model = buildWorkspaceModel({ trades, reconciliations, activity: undefined, stages: [] });

    const node = model.trades[0];
    expect(node.parentContracts).toHaveLength(1);
    const pc = node.parentContracts[0];
    expect(pc.parent.id).toBe("P");
    expect(pc.children.map((c) => c.id)).toEqual(["C1", "C2"]);
    // The parent + its children never leak into the flat / contractor-group views.
    expect(node.contractorGroups).toHaveLength(0);
    expect(node.ungrouped).toHaveLength(0);
    // Combined: value counted once (300k), paid summed (parent 150k + children 0).
    expect(pc.rollup.quoted).toBe(300000);
    expect(pc.rollup.paid).toBe(150000);
    // No double-counting at the trade level either.
    expect(node.rollup.quoted).toBe(300000);
    expect(node.rollup.paid).toBe(150000);
  });

  it("counts a hidden (completed) child's value via the parent's own leftover", () => {
    // Parent value 328050 but only two visible children sum to 300000 — the extra
    // 28050 belongs to a completed child filtered out of the tree.
    const parent = contract({ id: "P", teamId: "tJ", totalValue: 328050 });
    const c1 = contract({ id: "C1", teamId: "tJ", totalValue: 100000, parentSubcontractId: "P" });
    const c2 = contract({ id: "C2", teamId: "tJ", totalValue: 200000, parentSubcontractId: "P" });
    const model = buildWorkspaceModel({
      trades: [{ category: civilCat, contracts: [parent, c1, c2] }],
      reconciliations: undefined,
      activity: undefined,
      stages: [],
    });
    const pc = model.trades[0].parentContracts[0];
    expect(pc.rollup.quoted).toBe(328050);
    expect(findParentContract(model, "P")?.parentContract.parent.id).toBe("P");
    expect(findParentContract(model, "C1")).toBeNull();
  });
});

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

describe("findGroup / groupSelectionKey", () => {
  const model = buildWorkspaceModel({
    trades: [
      {
        category: civilCat,
        contracts: [
          contract({ id: "a", title: "Ground", teamId: "jithin" }),
          contract({ id: "b", title: "First", teamId: "jithin" }),
        ],
      },
    ],
    reconciliations: undefined,
    activity: undefined,
    stages: [],
  });

  it("round-trips a group through its selection key", () => {
    const group = model.trades[0].contractorGroups[0];
    const key = groupSelectionKey("civil", group.key);
    const hit = findGroup(model, key);
    expect(hit).not.toBeNull();
    expect(hit!.group.key).toBe(group.key);
    expect(hit!.node.category.id).toBe("civil");
    expect(hit!.group.tasks.map((t) => t.id).sort()).toEqual(["a", "b"]);
  });

  it("returns null for a missing key, a null key, or a malformed key", () => {
    expect(findGroup(model, null)).toBeNull();
    expect(findGroup(model, "civil::team:nobody")).toBeNull();
    expect(findGroup(model, "no-separator")).toBeNull();
    expect(findGroup(model, "wrong-trade::team:jithin")).toBeNull();
  });
});
