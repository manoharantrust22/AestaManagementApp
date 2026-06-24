/**
 * Helpers for drag-and-drop re-parenting in the Workforce ladder. A node may be moved
 * under any other node in the SAME trade, except its own subtree (that would create a
 * cycle) and its current parent (a no-op). Tier is derived from depth, so a node dropped
 * on a Contract becomes a Section, on a Section becomes a Task, etc.
 *
 * Pure (no React) so the drag guard and the "Move to…" sheet share one source of truth,
 * and it's unit-testable.
 */
import type { ContractNode, ContractTier, TradeNode } from "./workspaceModel";

export interface MoveTarget {
  /** The id to set as the moved node's new parent. */
  id: string;
  title: string;
  who: string;
  tier: ContractTier;
  /** Depth in the trade tree, for indentation in the picker. */
  depth: number;
}

/** Every id in a node's subtree (the node itself + all descendants). */
export function collectSubtreeIds(
  node: ContractNode,
  into: Set<string> = new Set()
): Set<string> {
  into.add(node.task.id);
  for (const c of node.children) collectSubtreeIds(c, into);
  return into;
}

interface FlatEntry {
  node: ContractNode;
  depth: number;
  parentId: string | null;
}

function flattenTrade(trade: TradeNode): FlatEntry[] {
  const out: FlatEntry[] = [];
  const walk = (node: ContractNode, depth: number, parentId: string | null) => {
    out.push({ node, depth, parentId });
    for (const c of node.children) walk(c, depth + 1, node.task.id);
  };
  for (const c of trade.contracts) walk(c, 0, null);
  return out;
}

/** Find a node (and its current parent id) anywhere in the trade tree. */
export function findNodeInTrade(
  trade: TradeNode,
  nodeId: string
): { node: ContractNode; parentId: string | null } | null {
  const hit = flattenTrade(trade).find((e) => e.node.task.id === nodeId);
  return hit ? { node: hit.node, parentId: hit.parentId } : null;
}

/**
 * Valid destinations to move `nodeId` under, within its trade — excludes the node's own
 * subtree (self + descendants) and its current parent. The caller offers "Top level"
 * (parent = null) separately, valid whenever the node isn't already top-level.
 */
export function moveTargetsForNode(trade: TradeNode, nodeId: string): MoveTarget[] {
  const flat = flattenTrade(trade);
  const me = flat.find((e) => e.node.task.id === nodeId);
  if (!me) return [];
  const forbidden = collectSubtreeIds(me.node);
  return flat
    .filter((e) => !forbidden.has(e.node.task.id) && e.node.task.id !== me.parentId)
    .map((e) => ({
      id: e.node.task.id,
      title: e.node.task.title,
      who: e.node.task.who,
      tier: e.node.tier,
      depth: e.depth,
    }));
}

/**
 * Whether dropping `nodeId` onto `targetParentId` (null = top level) is a legal move.
 * Mirrors the server-side guard in move_subcontract_node so the UI can reject instantly.
 */
export function isValidMove(
  trade: TradeNode,
  nodeId: string,
  targetParentId: string | null
): boolean {
  const me = findNodeInTrade(trade, nodeId);
  if (!me) return false;
  // No-op: already under this parent.
  if (me.parentId === targetParentId) return false;
  if (targetParentId === null) return true; // → top-level, always allowed when not already
  if (targetParentId === nodeId) return false;
  return !collectSubtreeIds(me.node).has(targetParentId);
}
