import { describe, it, expect } from "vitest";
import type { ContractNode, TradeNode } from "./workspaceModel";
import {
  collectSubtreeIds,
  findNodeInTrade,
  moveTargetsForNode,
  isValidMove,
} from "./moveTargets";

// Lightweight nodes — moveTargets only reads task.id/title/who, tier and children.
const node = (
  id: string,
  tier: ContractNode["tier"],
  children: ContractNode[] = []
): ContractNode =>
  ({
    task: { id, title: id, who: "X", parentSubcontractId: null } as any,
    tier,
    children,
    packages: [],
    rollup: {} as any,
  }) as ContractNode;

// Tree:  C ─ S1 ─ T1
//           └ S2
const T1 = node("T1", "task");
const S1 = node("S1", "section", [T1]);
const S2 = node("S2", "section");
const C = node("C", "contract", [S1, S2]);
const trade: TradeNode = {
  category: { id: "t", name: "Civil", isSystemSeed: false, isActive: true } as any,
  tasks: [],
  contracts: [C],
  rollup: {} as any,
};

describe("moveTargets", () => {
  it("collectSubtreeIds includes the node and all descendants", () => {
    expect([...collectSubtreeIds(S1)].sort()).toEqual(["S1", "T1"]);
    expect([...collectSubtreeIds(C)].sort()).toEqual(["C", "S1", "S2", "T1"]);
  });

  it("findNodeInTrade returns the node and its current parent", () => {
    expect(findNodeInTrade(trade, "S1")?.parentId).toBe("C");
    expect(findNodeInTrade(trade, "T1")?.parentId).toBe("S1");
    expect(findNodeInTrade(trade, "C")?.parentId).toBeNull();
    expect(findNodeInTrade(trade, "nope")).toBeNull();
  });

  it("moveTargetsForNode excludes own subtree and current parent", () => {
    // S1's subtree = {S1,T1}; current parent = C → only S2 remains.
    expect(moveTargetsForNode(trade, "S1").map((t) => t.id)).toEqual(["S2"]);
    // T1's subtree = {T1}; current parent = S1 → C and S2 remain (not S1).
    expect(moveTargetsForNode(trade, "T1").map((t) => t.id).sort()).toEqual(["C", "S2"]);
  });

  it("isValidMove rejects cycles, self and no-ops; allows real moves + top-level", () => {
    expect(isValidMove(trade, "S1", "T1")).toBe(false); // under own descendant
    expect(isValidMove(trade, "S1", "S1")).toBe(false); // under itself
    expect(isValidMove(trade, "S1", "C")).toBe(false); // already under C (no-op)
    expect(isValidMove(trade, "S1", "S2")).toBe(true); // real move
    expect(isValidMove(trade, "S1", null)).toBe(true); // → top-level (was under C)
    expect(isValidMove(trade, "C", null)).toBe(false); // already top-level (no-op)
  });
});
