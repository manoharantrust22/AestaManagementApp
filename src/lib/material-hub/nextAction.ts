import type { MaterialThread } from "./threadTypes";

export type NextActionWho = "admin" | "engineer" | "office";

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
  if (t.stage === "requested") return { who: "admin", label: "Approve →", verb: "Approve" };
  if (t.stage === "approved") return { who: "admin", label: "Create PO →", verb: "Create PO" };

  // 'ordered' covers both no-delivery-yet AND partial-delivered. The next
  // action is always to record the next batch.
  if (t.stage === "ordered") {
    const partial = t.po && t.po.received_qty > 0 && t.po.received_qty < t.po.qty;
    return {
      who: "engineer",
      label: partial ? "Record next batch →" : "Record delivery →",
      verb: partial ? "Record batch" : "Record delivery",
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
export interface InterSiteDebt {
  iOwe: number;
  othersOwe: number;
  net: number;
  detail: { from_site: string; to_site: string; thread: MaterialThread; used: number; value: number }[];
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
