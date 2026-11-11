/**
 * "End contract early" preview math — a pure mirror of the `end_subcontract_early` RPC
 * (migration 20261108130000) so the dialog can show exactly what will happen before the
 * owner confirms.
 *
 * Rules (must stay in lockstep with the SQL):
 *  • Every non-completed node is frozen at what was paid:
 *      final(n) = own paid + Σ final(child)
 *    so value == paid at every level and "Remaining to pay" becomes ₹0.
 *  • Children already `completed` keep their value (that work was genuinely finished).
 *  • Fixed-price packages are separate deals and are NOT touched.
 *  • Hand-over candidates: each direct child with unfinished scope (old value − final),
 *    plus the remainder recorded directly on the contract (own leftover − own paid).
 */
import type { ContractNode } from "./workspaceModel";

export interface ClosureHandoverCandidate {
  /** Child section id, or the root id for the "directly on the contract" remainder. */
  id: string;
  title: string;
  /** True for the root's own remainder (not inside any section). */
  isDirect: boolean;
  originalValue: number;
  /** Subcontract money paid in this part's subtree (packages excluded). */
  paid: number;
  /** Unfinished scope that moves to In-house when handed over. */
  left: number;
}

export interface ClosurePlan {
  originalValue: number;
  /** New contract value = everything paid on the contract + its sections. */
  finalValue: number;
  /** originalValue − finalValue (never negative). */
  writtenOff: number;
  /** Paid on the contract subtree (packages excluded) — equals finalValue unless a part was already completed. */
  paid: number;
  candidates: ClosureHandoverCandidate[];
  /** Fixed-price packages under the contract that stay open (another deal). */
  openPackages: { id: string; title: string; left: number }[];
}

export function planEarlyClosure(root: ContractNode): ClosurePlan {
  const finalOf = new Map<string, number>();
  const paidOf = new Map<string, number>();

  const walk = (n: ContractNode, isRoot: boolean): number => {
    let childFinal = 0;
    let childPaid = 0;
    for (const c of n.children) {
      childFinal += walk(c, false);
      childPaid += paidOf.get(c.task.id) ?? 0;
    }
    paidOf.set(n.task.id, n.task.paid + childPaid);
    const f =
      !isRoot && n.task.status === "completed" ? n.task.quoted : n.task.paid + childFinal;
    finalOf.set(n.task.id, f);
    return f;
  };
  const finalValue = walk(root, true);

  const candidates: ClosureHandoverCandidate[] = [];
  for (const c of root.children) {
    if (c.task.status === "completed") continue;
    const left = Math.max(0, c.task.quoted - (finalOf.get(c.task.id) ?? 0));
    if (left <= 0) continue;
    candidates.push({
      id: c.task.id,
      title: c.task.title,
      isDirect: false,
      originalValue: c.task.quoted,
      paid: paidOf.get(c.task.id) ?? 0,
      left,
    });
  }
  const childQuoted = root.children.reduce((s, c) => s + c.task.quoted, 0);
  const ownLeftover = Math.max(0, root.task.quoted - childQuoted);
  const directLeft = Math.max(0, ownLeftover - root.task.paid);
  if (directLeft > 0) {
    candidates.push({
      id: root.task.id,
      title: `Remaining work from ${root.task.title}`,
      isDirect: true,
      originalValue: ownLeftover,
      paid: root.task.paid,
      left: directLeft,
    });
  }

  const openPackages: ClosurePlan["openPackages"] = [];
  const collectPkgs = (n: ContractNode) => {
    for (const p of n.packages) {
      if (p.status === "completed" || p.status === "cancelled") continue;
      openPackages.push({ id: p.id, title: p.title, left: Math.max(0, p.quoted - p.paid) });
    }
    n.children.forEach(collectPkgs);
  };
  collectPkgs(root);

  return {
    originalValue: root.task.quoted,
    finalValue,
    writtenOff: Math.max(0, root.task.quoted - finalValue),
    paid: paidOf.get(root.task.id) ?? 0,
    candidates,
    openPackages,
  };
}

/** Whether a node can be ended early from the UI (mirrors the RPC's guards). */
export function canEndEarly(node: ContractNode | null | undefined): boolean {
  if (!node) return false;
  const t = node.task;
  return (
    node.tier === "contract" &&
    !t.parentSubcontractId &&
    !t.isInHouse &&
    !t.closure &&
    !!t.tradeCategoryId &&
    (t.status === "active" || t.status === "on_hold")
  );
}

export const CLOSURE_REASON_LABEL: Record<string, string> = {
  contractor_left: "Contractor left site",
  terminated: "Terminated by us",
  mutual: "Closed by mutual agreement",
  other: "Ended early",
};

export function closureReasonLabel(reason: string | null | undefined): string {
  return (reason && CLOSURE_REASON_LABEL[reason]) || "Ended early";
}
