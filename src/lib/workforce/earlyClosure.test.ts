import { describe, it, expect } from "vitest";
import { buildWorkspaceModel, type WorkspacePackage } from "./workspaceModel";
import { canEndEarly, planEarlyClosure } from "./earlyClosure";
import type { ContractReconciliation, Trade, TradeContract } from "@/types/trade.types";

function contract(over: Partial<TradeContract>): TradeContract {
  return {
    id: "c1",
    siteId: "s1",
    tradeCategoryId: "civil",
    stageId: null,
    title: "Task",
    laborTrackingMode: "detailed",
    isInHouse: false,
    contractType: "mesthri",
    status: "active",
    totalValue: 0,
    workProgressPercent: null,
    teamId: "t1",
    laborerId: null,
    mesthriOrSpecialistName: "Jithin",
    parentSubcontractId: null,
    createdAt: "2026-01-01",
    ...over,
  };
}

const recon = (id: string, quoted: number, paid: number): ContractReconciliation => ({
  subcontractId: id,
  quotedAmount: quoted,
  amountPaid: paid,
  amountPaidSubcontractPayments: 0,
  amountPaidSettlements: paid,
  impliedLaborValueDetailed: 0,
  impliedLaborValueHeadcount: 0,
});

const civilCat = { id: "civil", name: "Civil", isSystemSeed: true, isActive: true };

/** Shaped like Jithin's Padmavathy contract (prod numbers, 2026-11-08). */
function jithin(opts: { packages?: WorkspacePackage[]; groundCompleted?: boolean } = {}) {
  const rows: Array<[TradeContract, number]> = [
    [contract({ id: "root", title: "Jithin Civil contract", totalValue: 1936000 }), 1134095],
    [contract({ id: "g", title: "Ground Floor Construction", parentSubcontractId: "root", totalValue: 500000, status: opts.groundCompleted ? "completed" : "active" }), 2400],
    [contract({ id: "f1", title: "1st Floor Construction", parentSubcontractId: "root", totalValue: 665000 }), 0],
    [contract({ id: "f2", title: "2nd Floor Construction", parentSubcontractId: "root", totalValue: 758000 }), 800],
    [contract({ id: "wt", title: "Water tank roof", parentSubcontractId: "root", totalValue: 0 }), 3000],
  ];
  const trades: Trade[] = [{ category: civilCat, contracts: rows.map(([c]) => c) }];
  const reconciliations = new Map(rows.map(([c, paid]) => [c.id, recon(c.id, c.totalValue, paid)]));
  const model = buildWorkspaceModel({ trades, reconciliations, activity: undefined, packages: opts.packages });
  return model.trades[0].contracts[0];
}

describe("planEarlyClosure", () => {
  it("freezes the contract at what was paid and writes off the rest", () => {
    const plan = planEarlyClosure(jithin());
    expect(plan.originalValue).toBe(1936000);
    expect(plan.finalValue).toBe(1134095 + 2400 + 800 + 3000);
    expect(plan.writtenOff).toBe(1936000 - 1140295);
    expect(plan.paid).toBe(plan.finalValue);
  });

  it("offers each unfinished section for hand-over with its unfinished scope", () => {
    const plan = planEarlyClosure(jithin());
    const byId = Object.fromEntries(plan.candidates.map((c) => [c.id, c]));
    expect(byId.g.left).toBe(497600);
    expect(byId.f1.left).toBe(665000);
    expect(byId.f2.left).toBe(757200);
    // Water tank was over-paid against a ₹0 value — nothing left to hand over.
    expect(byId.wt).toBeUndefined();
    // Own leftover ₹13,000 is far below ₹11.3L paid directly — no direct remainder.
    expect(plan.candidates.some((c) => c.isDirect)).toBe(false);
  });

  it("keeps a completed section's value and never hands it over", () => {
    const plan = planEarlyClosure(jithin({ groundCompleted: true }));
    expect(plan.finalValue).toBe(1134095 + 500000 + 800 + 3000);
    expect(plan.candidates.find((c) => c.id === "g")).toBeUndefined();
  });

  it("offers the direct remainder when a contract has no sections", () => {
    const trades: Trade[] = [{ category: civilCat, contracts: [contract({ id: "solo", title: "Plastering", totalValue: 300000 })] }];
    const model = buildWorkspaceModel({
      trades,
      reconciliations: new Map([["solo", recon("solo", 300000, 120000)]]),
      activity: undefined,
    });
    const plan = planEarlyClosure(model.trades[0].contracts[0]);
    expect(plan.finalValue).toBe(120000);
    expect(plan.candidates).toEqual([
      expect.objectContaining({ id: "solo", isDirect: true, left: 180000 }),
    ]);
  });

  it("lists open fixed-price packages without touching them", () => {
    const plan = planEarlyClosure(
      jithin({
        packages: [
          { id: "p1", title: "Sump plastering", tradeCategoryId: "civil", parentSubcontractId: "root", who: "Jagadish", quoted: 10000, paid: 4000, status: "active" },
          { id: "p2", title: "Done job", tradeCategoryId: "civil", parentSubcontractId: "root", who: "Varun", quoted: 5000, paid: 5000, status: "completed" },
        ],
      })
    );
    expect(plan.openPackages).toEqual([{ id: "p1", title: "Sump plastering", left: 6000 }]);
    expect(plan.finalValue).toBe(1140295);
  });
});

describe("canEndEarly", () => {
  it("allows an active top-level contractor contract only", () => {
    const root = jithin();
    expect(canEndEarly(root)).toBe(true);
    expect(canEndEarly(root.children[0])).toBe(false);
  });

  it("refuses in-house and already-ended contracts", () => {
    const trades: Trade[] = [
      {
        category: civilCat,
        contracts: [
          contract({ id: "ih", title: "Civil — In-house", isInHouse: true }),
          contract({
            id: "x",
            title: "Old",
            status: "completed",
            closure: {
              type: "ended_early", reason: "contractor_left", note: null, endDate: "2026-11-01",
              originalValue: 100, handedOverToId: null, writtenOff: 50, handedOverTotal: 0,
              inHouseId: null, handovers: [],
            },
          }),
        ],
      },
    ];
    const m = buildWorkspaceModel({ trades, reconciliations: undefined, activity: undefined });
    for (const n of m.trades[0].contracts) expect(canEndEarly(n)).toBe(false);
  });
});
