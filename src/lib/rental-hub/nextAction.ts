/**
 * Rental Hub v2 — next-action resolver and selectors.
 *
 * `nextAction(t)` is the single function that decides what the row's right-
 * side button does, and it drives the "Needs action" KPI count. Mirrors the
 * spec's R.nextAction in docs/RentalHub_V2_redesign/README.md lines 502-516.
 *
 * Lifecycle order (only one returns non-null at a time):
 *   pending                      → admin: Approve
 *   approved | draft             → admin: Confirm PO
 *   confirmed                    → engineer: Verify delivery
 *   active | partially_returned  → engineer: Record return
 *   completed, vendor pending    → office: Settle vendor
 *   completed, transport in pending  → office: Settle transport in
 *   completed, transport out pending → office: Settle transport out
 *   settled / cancelled          → null
 */

import type { RentalThread } from "./threadTypes";

export type NextActionWho = "admin" | "engineer" | "office";

export type NextActionIntent =
  | "approve"
  | "confirm"
  | "verify-delivery"
  | "record-return"
  | "settle-vendor"
  | "settle-transport-in"
  | "settle-transport-out"
  | "extend"
  | "add-advance";

export interface NextAction {
  who: NextActionWho;
  /** Full label used in panels (e.g. "Settle vendor"). */
  label: string;
  /** Short verb used inside the row button (e.g. "Settle"). */
  verb: string;
  /** Intent string used by the dialog router. */
  intent: NextActionIntent;
  /**
   * Visual tone hint for the action button. Most lifecycle steps stay
   * primary; record-return on an overdue row is forced to danger; settle
   * actions on completed orders use warn.
   */
  tone: "primary" | "warn" | "danger";
}

export function nextAction(t: RentalThread): NextAction | null {
  if (t.isCancelled) return null;
  if (t.effective_status === "settled") return null;

  if (t.status === "pending") {
    return { who: "admin", label: "Approve", verb: "Approve", intent: "approve", tone: "primary" };
  }
  if (t.status === "approved" || t.status === "draft") {
    return { who: "admin", label: "Confirm PO", verb: "Confirm", intent: "confirm", tone: "primary" };
  }
  if (t.status === "confirmed") {
    return {
      who: "engineer",
      label: "Verify delivery",
      verb: "Verify",
      intent: "verify-delivery",
      tone: "primary",
    };
  }
  if (t.status === "active" || t.status === "partially_returned") {
    return {
      who: "engineer",
      label: "Record return",
      verb: "Return",
      intent: "record-return",
      tone: t.isOverdue ? "danger" : "primary",
    };
  }
  if (t.status === "completed") {
    if (!t.settlements.vendor) {
      return { who: "office", label: "Settle vendor", verb: "Settle", intent: "settle-vendor", tone: "warn" };
    }
    if (t.requiresTransportInSettlement && !t.settlements.transportIn) {
      return {
        who: "office",
        label: "Settle transport in",
        verb: "Settle in",
        intent: "settle-transport-in",
        tone: "warn",
      };
    }
    if (t.requiresTransportOutSettlement && !t.settlements.transportOut) {
      return {
        who: "office",
        label: "Settle transport out",
        verb: "Settle out",
        intent: "settle-transport-out",
        tone: "warn",
      };
    }
  }
  return null;
}

// ============================================
// Counts (drive KPI strip and filter chip badges)
// ============================================

export interface RentalCounts {
  all: number;
  active: number;
  needsAction: number;
  overdue: number;
  toSettle: number;
  history: number;
  balanceDue: number;
  accruedLive: number;
}

/** Active stage covers anything the engineer is currently tracking. */
const ACTIVE_STATUSES = new Set([
  "pending",
  "approved",
  "draft",
  "confirmed",
  "active",
  "partially_returned",
]);

export function rentalCounts(threads: RentalThread[]): RentalCounts {
  let active = 0;
  let needsAction = 0;
  let overdue = 0;
  let toSettle = 0;
  let history = 0;
  let balanceDue = 0;
  let accruedLive = 0;

  for (const t of threads) {
    if (t.isCancelled || t.effective_status === "settled") {
      history += 1;
    } else if (ACTIVE_STATUSES.has(t.status)) {
      active += 1;
    }
    if (nextAction(t) != null) needsAction += 1;
    if (t.isOverdue) overdue += 1;
    if (t.status === "completed" && t.effective_status !== "settled") {
      toSettle += 1;
      balanceDue += Math.max(0, t.accruedCost - t.totalAdvancePaid);
    }
    if (t.status === "active" || t.status === "partially_returned") {
      accruedLive += t.accruedCost;
    }
  }

  return {
    all: threads.length,
    active,
    needsAction,
    overdue,
    toSettle,
    history,
    balanceDue,
    accruedLive,
  };
}

// ============================================
// Action-queue selectors (overdue + to-settle panels)
// ============================================

export interface OverdueQueueItem {
  thread: RentalThread;
  daysOverdue: number;
}

export function overdueQueueItems(threads: RentalThread[]): OverdueQueueItem[] {
  const now = Date.now();
  return threads
    .filter((t) => t.isOverdue && !t.isCancelled && t.effective_status !== "settled")
    .map((t) => {
      const expected = t.expectedEnd ? new Date(t.expectedEnd).getTime() : now;
      const daysOverdue = Math.max(
        0,
        Math.floor((now - expected) / (1000 * 60 * 60 * 24)),
      );
      return { thread: t, daysOverdue };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

export interface ToSettleQueueItem {
  thread: RentalThread;
  balanceEstimate: number;
}

export function toSettleQueueItems(threads: RentalThread[]): ToSettleQueueItem[] {
  return threads
    .filter((t) => t.status === "completed" && t.effective_status !== "settled")
    .map((t) => ({
      thread: t,
      balanceEstimate: Math.max(0, t.accruedCost - t.totalAdvancePaid),
    }))
    .sort((a, b) => b.balanceEstimate - a.balanceEstimate);
}
