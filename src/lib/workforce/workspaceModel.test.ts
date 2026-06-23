import { describe, it, expect } from "vitest";
import {
  buildWorkspaceModel,
  computeInitials,
  contractMoneySplit,
  contractorGroupFromNode,
  findContractNode,
  findTask,
} from "./workspaceModel";
import type { WorkspacePackage } from "./workspaceModel";
import type {
  ContractReconciliation,
  Trade,
  TradeContract,
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

function wpkg(over: Partial<WorkspacePackage> & { id: string }): WorkspacePackage {
  return {
    title: "Package",
    tradeCategoryId: "civil",
    parentSubcontractId: null,
    who: "Murugesan",
    quoted: 0,
    paid: 0,
    status: "active",
    ...over,
  };
}

function recon(
  over: Partial<ContractReconciliation> & { subcontractId: string }
): ContractReconciliation {
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

describe("Contract ▸ Section ▸ Task tree (buildWorkspaceModel)", () => {
  it("nests a 3-tier ladder and tags each node's tier", () => {
    const p = contract({ id: "P", title: "Jithin Civil contract", teamId: "tJ", totalValue: 300000 });
    const s = contract({ id: "S", title: "Ground Floor", teamId: "tJ", totalValue: 300000, parentSubcontractId: "P" });
    const t = contract({ id: "T", title: "Footing grid", teamId: "tJ", totalValue: 100000, parentSubcontractId: "S" });
    const trades: Trade[] = [{ category: civilCat, contracts: [p, s, t] }];
    const model = buildWorkspaceModel({ trades, reconciliations: undefined, activity: undefined });

    const node = model.trades[0];
    // One top-level Contract; its subtree is Section → Task.
    expect(node.contracts).toHaveLength(1);
    const pc = node.contracts[0];
    expect(pc.tier).toBe("contract");
    expect(pc.task.id).toBe("P");
    expect(pc.children).toHaveLength(1);

    const sec = pc.children[0];
    expect(sec.tier).toBe("section");
    expect(sec.task.id).toBe("S");
    expect(sec.children).toHaveLength(1);

    const task = sec.children[0];
    expect(task.tier).toBe("task");
    expect(task.task.id).toBe("T");
    expect(task.children).toHaveLength(0);

    // Flattened list still carries every row (for counts / search / findTask).
    expect(node.tasks.map((x) => x.id).sort()).toEqual(["P", "S", "T"]);
  });

  it("de-dupes the rollup across 3 levels — value counted once, paid summed", () => {
    const p = contract({ id: "P", teamId: "tJ", totalValue: 300000 });
    const s = contract({ id: "S", teamId: "tJ", totalValue: 300000, parentSubcontractId: "P" });
    const t = contract({ id: "T", teamId: "tJ", totalValue: 100000, parentSubcontractId: "S" });
    const reconciliations = new Map<string, ContractReconciliation>([
      ["P", recon({ subcontractId: "P", quotedAmount: 300000, amountPaid: 100000 })],
      ["S", recon({ subcontractId: "S", quotedAmount: 300000, amountPaid: 30000 })],
      ["T", recon({ subcontractId: "T", quotedAmount: 100000, amountPaid: 20000 })],
    ]);
    const model = buildWorkspaceModel({
      trades: [{ category: civilCat, contracts: [p, s, t] }],
      reconciliations,
      activity: undefined,
    });

    const pc = model.trades[0].contracts[0];
    // Whole-contract value counted exactly once; paid summed across all 3 rows.
    expect(pc.rollup.quoted).toBe(300000);
    expect(pc.rollup.paid).toBe(150000);
    // No double counting at trade / site level.
    expect(model.trades[0].rollup.quoted).toBe(300000);
    expect(model.site.quoted).toBe(300000);
    expect(model.site.paid).toBe(150000);
  });

  it("counts a hidden child's value via the parent's own leftover", () => {
    // Parent value 328050 but the two visible sections sum to 300000 — the extra
    // 28050 belongs to a completed section filtered out of the tree.
    const p = contract({ id: "P", teamId: "tJ", totalValue: 328050 });
    const s1 = contract({ id: "S1", teamId: "tJ", totalValue: 100000, parentSubcontractId: "P" });
    const s2 = contract({ id: "S2", teamId: "tJ", totalValue: 200000, parentSubcontractId: "P" });
    const model = buildWorkspaceModel({
      trades: [{ category: civilCat, contracts: [p, s1, s2] }],
      reconciliations: undefined,
      activity: undefined,
    });
    expect(model.trades[0].contracts[0].rollup.quoted).toBe(328050);
  });

  it("treats a simple top-level row as a leaf Contract", () => {
    const model = buildWorkspaceModel({
      trades: [{ category: civilCat, contracts: [contract({ id: "solo", totalValue: 50000 })] }],
      reconciliations: undefined,
      activity: undefined,
    });
    const pc = model.trades[0].contracts[0];
    expect(pc.tier).toBe("contract");
    expect(pc.children).toHaveLength(0);
    expect(pc.rollup.quoted).toBe(50000);
  });

  it("surfaces an orphan (parent not visible) as its own Contract", () => {
    const orphan = contract({ id: "O", parentSubcontractId: "missing", totalValue: 10000 });
    const model = buildWorkspaceModel({
      trades: [{ category: civilCat, contracts: [orphan] }],
      reconciliations: undefined,
      activity: undefined,
    });
    expect(model.trades[0].contracts.map((c) => c.task.id)).toEqual(["O"]);
  });

  it("splits the site rollup by status tab without double-counting parents", () => {
    const p = contract({ id: "P", teamId: "tJ", totalValue: 300000, status: "active" });
    const s = contract({ id: "S", teamId: "tJ", totalValue: 300000, parentSubcontractId: "P", status: "active" });
    const planned = contract({ id: "D", teamId: "tD", totalValue: 80000, status: "draft" });
    const model = buildWorkspaceModel({
      trades: [{ category: civilCat, contracts: [p, s, planned] }],
      reconciliations: undefined,
      activity: undefined,
    });
    expect(model.siteByTab.active.quoted).toBe(300000); // P subtree, counted once
    expect(model.siteByTab.future.quoted).toBe(80000); // the draft contract
    expect(model.siteByTab.completed.quoted).toBe(0);
  });
});

describe("findContractNode / contractorGroupFromNode / findTask", () => {
  const p = contract({ id: "P", title: "Jithin Civil contract", teamId: "tJ", totalValue: 300000 });
  const s = contract({ id: "S", title: "Ground Floor", teamId: "tJ", totalValue: 300000, parentSubcontractId: "P" });
  const t = contract({ id: "T", title: "Footing grid", teamId: "tJ", totalValue: 100000, parentSubcontractId: "S" });
  const model = buildWorkspaceModel({
    trades: [{ category: civilCat, contracts: [p, s, t] }],
    reconciliations: undefined,
    activity: undefined,
  });

  it("finds a container node and a deeply nested leaf", () => {
    expect(findContractNode(model, "P")?.node.tier).toBe("contract");
    expect(findContractNode(model, "T")?.node.tier).toBe("task");
    expect(findContractNode(model, "nope")).toBeNull();
    expect(findContractNode(model, null)).toBeNull();
  });

  it("builds the combined-contract shape from a container's children", () => {
    const node = findContractNode(model, "P")!.node;
    const g = contractorGroupFromNode(node);
    expect(g.key).toBe("P");
    expect(g.tasks.map((x) => x.id)).toEqual(["S"]); // direct children only
    expect(g.rollup.quoted).toBe(300000);
  });

  it("findTask resolves any row by id", () => {
    expect(findTask(model, "T")?.title).toBe("Footing grid");
    expect(findTask(model, "missing")).toBeNull();
  });
});

describe("fixed-price packages fold into the rollup + parts", () => {
  // Jithin: 3 floors summing to the contract value, ₹9,87,095 paid on the WHOLE contract
  // (not a floor), plus a ₹60,000 package (₹40,000 paid) hanging under the contract.
  const P = contract({ id: "P", title: "Jithin Civil contract", teamId: "tJ", totalValue: 1936000 });
  const gf = contract({ id: "GF", title: "Ground Floor", teamId: "tJ", totalValue: 513000, parentSubcontractId: "P" });
  const f1 = contract({ id: "F1", title: "1st Floor", teamId: "tJ", totalValue: 665000, parentSubcontractId: "P" });
  const f2 = contract({ id: "F2", title: "2nd Floor", teamId: "tJ", totalValue: 758000, parentSubcontractId: "P" });
  const reconciliations = new Map<string, ContractReconciliation>([
    ["P", recon({ subcontractId: "P", quotedAmount: 1936000, amountPaid: 987095 })],
  ]);
  const saroja = wpkg({ id: "PKG", title: "Saroja Plastering", parentSubcontractId: "P", quoted: 60000, paid: 40000 });
  const model = buildWorkspaceModel({
    trades: [{ category: civilCat, contracts: [P, gf, f1, f2] }],
    reconciliations,
    activity: undefined,
    packages: [saroja],
  });
  const pc = model.trades[0].contracts[0];

  it("adds the package value + paid to the contract (and trade/site) totals", () => {
    expect(pc.rollup.quoted).toBe(1996000); // 1,936,000 floors + 60,000 package
    expect(pc.rollup.paid).toBe(1027095); // 987,095 whole-contract + 40,000 package
    expect(model.trades[0].rollup.quoted).toBe(1996000);
    expect(model.site.paid).toBe(1027095);
  });

  it("lists a package part, a whole-contract 'direct' part, and reconciles to the header", () => {
    const g = contractorGroupFromNode(pc);
    const kinds = g.parts.map((p) => p.kind);
    expect(kinds.filter((k) => k === "subcontract")).toHaveLength(3);
    expect(kinds).toContain("package");
    expect(kinds).toContain("direct");

    const pkgPart = g.parts.find((p) => p.kind === "package")!;
    expect(pkgPart.quoted).toBe(60000);
    expect(pkgPart.paid).toBe(40000);
    expect(pkgPart.remaining).toBe(20000);

    const direct = g.parts.find((p) => p.kind === "direct")!;
    expect(direct.paid).toBe(987095); // the whole-contract payment surfaces here
    expect(direct.quoted).toBe(0);

    // Parts add up to the header — nothing hidden.
    const sumQ = g.parts.reduce((s, p) => s + p.quoted, 0);
    const sumP = g.parts.reduce((s, p) => s + p.paid, 0);
    expect(sumQ).toBe(g.rollup.quoted);
    expect(sumP).toBe(g.rollup.paid);
  });

  it("a section's part reflects money paid to its tasks (not just its own row)", () => {
    const task = contract({ id: "T", title: "Footing grid", teamId: "tJ", totalValue: 100000, parentSubcontractId: "GF" });
    const recons2 = new Map<string, ContractReconciliation>([
      ["T", recon({ subcontractId: "T", quotedAmount: 100000, amountPaid: 25000 })],
    ]);
    const m2 = buildWorkspaceModel({
      trades: [{ category: civilCat, contracts: [P, gf, f1, f2, task] }],
      reconciliations: recons2,
      activity: undefined,
    });
    const g2 = contractorGroupFromNode(m2.trades[0].contracts[0]);
    const gfPart = g2.parts.find((p) => p.kind === "subcontract" && p.id === "GF")!;
    expect(gfPart.paid).toBe(25000); // rolled up from its task, not "paid 0%"
  });

  it("counts a loose package (no visible parent) in the trade total once", () => {
    const loose = wpkg({ id: "LOOSE", parentSubcontractId: null, quoted: 30000, paid: 10000 });
    const m3 = buildWorkspaceModel({
      trades: [{ category: civilCat, contracts: [contract({ id: "solo", totalValue: 50000 })] }],
      reconciliations: undefined,
      activity: undefined,
      packages: [loose],
    });
    expect(m3.trades[0].rollup.quoted).toBe(80000); // 50,000 contract + 30,000 loose package
    expect(m3.trades[0].rollup.paid).toBe(10000);
  });
});

describe("contractMoneySplit — paid out by source", () => {
  it("splits paid into Workspace (settlements) / Sections (fixed) / Task-work (packages) across the subtree", () => {
    const P = contract({ id: "P", teamId: "tJ", totalValue: 1000000 });
    const S = contract({ id: "S", teamId: "tJ", totalValue: 1000000, parentSubcontractId: "P" });
    const recons = new Map<string, ContractReconciliation>([
      ["P", recon({
        subcontractId: "P", quotedAmount: 1000000, amountPaid: 600000,
        amountPaidSettlements: 500000, amountPaidSubcontractPayments: 100000,
      })],
      ["S", recon({
        subcontractId: "S", quotedAmount: 1000000, amountPaid: 250000,
        amountPaidSettlements: 200000, amountPaidSubcontractPayments: 50000,
      })],
    ]);
    const pkg = wpkg({ id: "PKG", parentSubcontractId: "P", quoted: 60000, paid: 40000 });
    const model = buildWorkspaceModel({
      trades: [{ category: civilCat, contracts: [P, S] }],
      reconciliations: recons,
      activity: undefined,
      packages: [pkg],
    });
    const node = findContractNode(model, "P")!.node;
    const split = contractMoneySplit(node);

    expect(split.workspace).toBe(700000); // 500k + 200k salary settlements
    expect(split.sections).toBe(150000); // 100k + 50k fixed-price subcontract payments
    expect(split.taskWork).toBe(40000); // the package's paid
    expect(split.total).toBe(890000);
    // The split reconciles to the contract's rolled-up Paid out.
    expect(split.total).toBe(node.rollup.paid);
    // The combined-contract shape carries the same split.
    expect(contractorGroupFromNode(node).moneySplit).toEqual(split);
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

describe("per-task exposure", () => {
  it("computes exposure + severity from quoted / paid / work", () => {
    const model = buildWorkspaceModel({
      trades: [
        {
          category: civilCat,
          contracts: [
            contract({ id: "c1", workProgressPercent: 30, teamId: "tA" }),
            contract({ id: "c2", workProgressPercent: 60, teamId: "tB" }),
          ],
        },
      ],
      reconciliations: new Map<string, ContractReconciliation>([
        ["c1", recon({ subcontractId: "c1", quotedAmount: 100000, amountPaid: 60000 })],
        ["c2", recon({ subcontractId: "c2", quotedAmount: 100000, amountPaid: 40000 })],
      ]),
      activity: undefined,
    });
    const c1 = findTask(model, "c1")!;
    expect(c1.exposure.exposure).toBe(30000);
    expect(c1.exposure.severity).toBe("high");
    expect(c1.party).toBe("Mesthri team");
    expect(c1.initials).toBe("KA"); // Karthik
    const c2 = findTask(model, "c2")!;
    expect(c2.exposure.exposure).toBe(-20000);
    expect(c2.exposure.severity).toBe("safe");
    // tracked rollup: +30000 and -20000 → exposure +10000, atRisk 30000
    expect(model.site.exposure).toBe(10000);
    expect(model.site.atRisk).toBe(30000);
  });
});
