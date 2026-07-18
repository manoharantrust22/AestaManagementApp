import type { MaterialThread } from "./threadTypes";
import { advanceAwaitingSettle } from "./stageHelpers";
import type { UserRole } from "@/lib/permissions";

export type NextActionWho = "admin" | "engineer" | "office";

/**
 * Which user roles may actually PERFORM an action tagged with each `who`.
 * Admin is a super-role and may act everywhere; office handles the back-office
 * steps (PO, vendor/inter-site settlement); site engineers own the on-site
 * steps (delivery, usage). Office does NOT perform engineer actions — the
 * ownership ladder is SE → office → SE → SE → office.
 *
 * NOTE: do NOT gate with `hasAdminPermission()` — it is a dev bypass that
 * returns true for everyone. This map + `canActOnNext` is the client-side
 * mirror of the RLS rules (same split as `canCreatePurchaseOrders`).
 */
export const WHO_ALLOWED_ROLES: Record<NextActionWho, UserRole[]> = {
  admin: ["admin", "office"],
  office: ["admin", "office"],
  engineer: ["site_engineer", "admin"],
};

/** True when a user with `role` is allowed to perform `next`. */
export function canActOnNext(
  next: NextAction | null,
  role: UserRole | string | undefined | null
): boolean {
  if (!next) return false;
  return WHO_ALLOWED_ROLES[next.who].includes(role as UserRole);
}

export interface NextAction {
  who: NextActionWho;
  label: string;
  /** Short verb used inside the row button (e.g., "Approve") */
  verb: string;
}

/**
 * The single resolver that decides what action a thread is waiting on.
 * Drives the row's right-side button AND the "Needs action" KPI count.
 *
 * Mirrors `M.nextAction` in docs/MaterialHub_Redesign/proto-screens.jsx.
 */
export function nextAction(t: MaterialThread): NextAction | null {
  // Mirror threads (cluster-mate group POs surfaced read-only on the consumer
  // site) — actions stay with the originating site. The Hub shows "Read-only".
  if (t.is_mirror) return null;

  // Historical backfill: nothing to do. Records are entered in their terminal
  // state (already settled, already consumed); the Hub row shows "All clear".
  if (t.is_historical) return null;

  // Spot purchases bypass MR/PO/Delivery/Settlement
  if (t.purchase_type === "spot") {
    if (t.kind === "group" && t.spot_stage === "provisional") {
      return { who: "engineer", label: "Finalize split", verb: "Finalize" };
    }
    return null;
  }

  if (t.stage === "rejected") return null;
  // Approve + PO are ONE combined office step: creating the PO from a pending
  // request implicitly approves it (approval is stamped during PO creation).
  // Reject / approve-without-PO live in the row's kebab menu.
  if (t.stage === "requested") return { who: "office", label: "Create PO →", verb: "Create PO" };
  if (t.stage === "approved") return { who: "office", label: "Create PO →", verb: "Create PO" };

  // Advance (bulk) POs are paid BEFORE the vendor delivers — the money goes out
  // first, then the goods arrive part-by-part. Until the advance is recorded the
  // primary action is to settle the vendor, NOT to record a delivery (which
  // stays available as a secondary action inside the expanded card). Once the
  // advance is paid (advance_paid > 0) or a settlement row exists this is false
  // and we fall through to the normal delivery flow below.
  if (advanceAwaitingSettle(t)) {
    return { who: "office", label: "Settle vendor →", verb: "Settle" };
  }

  // 'ordered' covers both no-delivery-yet AND partial-delivered. The next
  // action is always to record the next delivery installment. (Labelled
  // "delivery", not "batch" — "batch" is overloaded in this app: a delivery
  // installment vs. a usage/stock batch vs. the parent MAT- batch code.)
  if (t.stage === "ordered") {
    const partial = t.po && t.po.received_qty > 0 && t.po.received_qty < t.po.qty;
    return {
      who: "engineer",
      label: partial ? "Record next delivery →" : "Record delivery →",
      verb: "Record delivery",
    };
  }

  if (t.stage === "delivered") {
    // Advance POs: vendor was settled at PO creation. Once fully delivered,
    // there's no settlement step — jump straight to usage.
    const isAdvancePaid =
      !!t.po && t.po.payment_timing === "advance" && t.po.advance_paid > 0;
    if (isAdvancePaid || t.settlement?.status === "settled") {
      return { who: "engineer", label: "Log usage →", verb: "Log usage" };
    }
    return { who: "office", label: "Settle vendor →", verb: "Settle" };
  }

  if (t.stage === "settled") {
    // Settled but no usage logged yet. Engineer's next step is to start
    // consuming from stock; not strictly required but surfaced as a hint.
    const hasStock = !!t.inventory && t.inventory.remaining > 0;
    if (hasStock) return { who: "engineer", label: "Log usage →", verb: "Log usage" };
    return null;
  }

  if (t.stage === "in-use") return { who: "engineer", label: "Log usage →", verb: "Log usage" };

  // Consumption is done (exhausted), but a group batch's cross-site portion is
  // still owed. Settling is independent of usage — surface it as the next step
  // so the row stays actionable instead of showing a dead "Log usage" button.
  // Two distinct steps: raise the settlement (reconcile), then pay it. A raised-
  // but-unpaid settlement is NOT done — keep it actionable as "Record payment".
  if (t.stage === "exhausted" && t.inter_site_pending) {
    if (t.inter_site_status === "raised_unpaid") {
      return { who: "office", label: "Record payment →", verb: "Record payment" };
    }
    return { who: "office", label: "Settle inter-site →", verb: "Settle inter-site" };
  }

  // A group buy fully consumed by its OWN paying site, whose cost has NOT yet
  // been posted to all-site expenses. "All clear" would be a lie — the ₹ spent
  // here was never recorded as a Material expense for the site. Surface a manual
  // push instead (replaces the dropped silent auto-trigger). Once posted
  // (t.self_use_expense present) the row legitimately reads "All clear".
  if (t.is_group_self_used && !t.self_use_expense) {
    return { who: "office", label: "Push to expense →", verb: "Push to expense" };
  }

  return null;
}

/**
 * Thread counts by category — used by KPI strip and filter chips. Same shape
 * as proto-state.js' `protoCounts`.
 */
export interface ThreadCounts {
  all: number;
  pendingApproval: number;
  awaitingPO: number;
  awaitingDelivery: number;
  pendingSettlement: number;
  inUse: number;
  group: number;
  own: number;
  advance: number;
  spot: number;
  spotNeedsAllocation: number;
  historical: number;
  needsAction: number;
}

export function threadCounts(threads: MaterialThread[]): ThreadCounts {
  return {
    all: threads.length,
    pendingApproval: threads.filter((t) => t.stage === "requested").length,
    awaitingPO: threads.filter((t) => t.stage === "approved").length,
    awaitingDelivery: threads.filter((t) => t.stage === "ordered").length,
    pendingSettlement: threads.filter(
      (t) => t.stage === "delivered" && t.settlement?.status === "pending"
    ).length,
    inUse: threads.filter((t) => t.stage === "in-use").length,
    group: threads.filter((t) => t.kind === "group").length,
    own: threads.filter((t) => t.kind === "own").length,
    advance: threads.filter((t) => t.advance).length,
    spot: threads.filter((t) => t.purchase_type === "spot").length,
    spotNeedsAllocation: threads.filter(
      (t) =>
        t.purchase_type === "spot" &&
        t.kind === "group" &&
        t.spot_stage === "provisional"
    ).length,
    historical: threads.filter((t) => !!t.is_historical).length,
    needsAction: threads.filter((t) => nextAction(t) != null).length,
  };
}

/**
 * Inter-site debt from threads. Spot threads carry payer info on the source
 * site (since the supervisor's wallet was funded by their site); standard
 * threads carry payer info on `po.payer_site_id`.
 */
/**
 * One contributing cross-site usage row. The thread-projection path
 * (`interSiteDebt` below) populates `thread`; the balance-sourced adapter used
 * by the v2 Inter-Site page populates `materialName`/`batchCode` directly (it
 * has no MaterialThread to hand). UI reads the display fields, falling back to
 * the thread when only that is present.
 */
export interface InterSiteDebtRecord {
  from_site: string;
  to_site: string;
  used: number;
  value: number;
  materialName?: string;
  batchCode?: string;
  thread?: MaterialThread;
}

export interface InterSiteDebt {
  iOwe: number;
  othersOwe: number;
  net: number;
  detail: InterSiteDebtRecord[];
}

export function interSiteDebt(
  threads: MaterialThread[],
  mySiteId: string
): InterSiteDebt {
  let othersOwe = 0;
  let iOwe = 0;
  const detail: InterSiteDebt["detail"] = [];

  for (const t of threads) {
    if (t.kind !== "group" || !t.inter_site_usage || t.inter_site_usage.length === 0) continue;
    const payerId = t.po ? t.po.payer_site_id : t.site_id;
    for (const u of t.inter_site_usage) {
      if (u.site_id === payerId) continue; // payer doesn't owe themselves
      if (u.site_id === mySiteId) {
        iOwe += u.value;
        detail.push({ from_site: mySiteId, to_site: payerId, thread: t, used: u.used, value: u.value });
      }
      if (payerId === mySiteId) {
        othersOwe += u.value;
        detail.push({ from_site: u.site_id, to_site: mySiteId, thread: t, used: u.used, value: u.value });
      }
    }
  }

  return { iOwe, othersOwe, net: othersOwe - iOwe, detail };
}
