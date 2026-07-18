import type { MaterialThread, ThreadStage } from "./threadTypes";
import { hubTokens, type HubTone } from "./tokens";

/**
 * A bulk/advance PO whose vendor has NOT been paid yet. For advance buys the
 * money goes out BEFORE the goods arrive (the vendor delivers part-by-part only
 * after the upfront payment), so until the advance is recorded the primary next
 * step is to SETTLE the vendor — not to record a delivery. Recording a delivery
 * stays possible but secondary.
 *
 * Scoped to the unpaid `ordered` state only: the instant the advance is paid
 * (`advance_paid > 0`) or a settlement row exists, this is false and the thread
 * reverts to the normal flow (DELIVER pulses, "Record delivery" is primary).
 *
 * Single source of truth shared by nextAction (row/table button),
 * buildMaterialPipeline (which step pulses), HubDialogRouter (which dialog the
 * button opens) and the in-card RecordSettlementButton — so they can't disagree.
 */
export function advanceAwaitingSettle(t: MaterialThread): boolean {
  return (
    t.advance &&
    t.stage === "ordered" &&
    (t.po?.advance_paid ?? 0) <= 0 &&
    t.settlement?.status !== "settled"
  );
}

/**
 * Canonical stage order. Index into this list = pipeline position.
 * Includes `rejected` at the end as a terminal divergence.
 */
export const M_STAGES: ThreadStage[] = [
  "requested",
  "approved",
  "ordered",
  "delivered",
  "settled",
  "in-use",
  "exhausted",
  "rejected",
];

/**
 * Stages shown in the per-row pipeline. `exhausted` and `rejected` are
 * terminal and collapse into the prior visible stage.
 *
 * NOTE: the synthetic "inventory" key does NOT exist as a real `ThreadStage`
 * value — it's a pure UI indicator that mirrors `thread.inventory` (populated
 * the moment any delivery batch lands at site). It sits right after DELIVER
 * (delivery immediately creates stock) and before SETTLE, which often
 * happens much later.
 *
 * The synthetic "inter-site" key is likewise NOT a real `ThreadStage`. It's
 * appended AFTER IN USE only for group threads with cross-site usage
 * (`thread.inter_site_applicable`) to show whether the cross-site debt is
 * reconciled — amber while pending, green check once settled. It is NOT part
 * of the global `VISIBLE_STAGES` list (own-site threads never show it); the
 * pipeline appends it on a per-thread basis.
 */
export type VisibleStageKey = ThreadStage | "inventory" | "inter-site";

// NOTE: `approved` is deliberately NOT a visible node. Approve + PO are one
// combined office step (creating the PO implicitly approves the request), so
// the rail shows a single PO node; `approved` remains a real internal
// ThreadStage in M_STAGES for stage math and legacy approved-but-no-PO threads.
export const VISIBLE_STAGES: { key: VisibleStageKey; label: string }[] = [
  { key: "requested", label: "REQ" },
  { key: "ordered", label: "PO" },
  { key: "delivered", label: "DELIVER" },
  { key: "inventory", label: "STOCK" },
  { key: "settled", label: "SETTLE" },
  { key: "in-use", label: "IN USE" },
];

/**
 * Advance-payment order: the vendor is paid upfront right after the PO (before
 * any delivery), so SETTLE belongs ahead of DELIVER/STOCK. On-delivery POs keep
 * the default order where settlement follows the goods. Only the visible
 * ordering changes — done/current state is still derived from M_STAGES indices
 * in buildMaterialPipeline, so moving SETTLE is purely presentational.
 */
const ADVANCE_VISIBLE_STAGES: { key: VisibleStageKey; label: string }[] = [
  { key: "requested", label: "REQ" },
  { key: "ordered", label: "PO" },
  { key: "settled", label: "SETTLE" },
  { key: "delivered", label: "DELIVER" },
  { key: "inventory", label: "STOCK" },
  { key: "in-use", label: "IN USE" },
];

/** The visible stage order for a thread — advance POs settle before delivery. */
export function getVisibleStages(
  advance: boolean
): { key: VisibleStageKey; label: string }[] {
  return advance ? ADVANCE_VISIBLE_STAGES : VISIBLE_STAGES;
}

export function stageLabel(stage: ThreadStage): string {
  switch (stage) {
    case "requested":
      return "Requested";
    case "approved":
      return "Approved";
    case "ordered":
      return "Ordered";
    case "in-transit":
      return "In transit";
    case "delivered":
      return "Delivered";
    case "settled":
      return "Settled";
    case "in-use":
      return "In use";
    case "exhausted":
      return "Exhausted";
    case "rejected":
      return "Rejected";
    default:
      return stage;
  }
}

export interface StagePillSpec {
  bg: string;
  fg: string;
  icon: "plus" | "check" | "receipt" | "download" | "trend" | "x";
  label: string;
  tone: HubTone;
}

export function stagePillSpec(stage: ThreadStage): StagePillSpec {
  switch (stage) {
    case "requested":
      return { bg: hubTokens.chip, fg: hubTokens.muted, icon: "plus", label: "REQUESTED", tone: "neutral" };
    case "approved":
      return { bg: hubTokens.primarySoft, fg: hubTokens.primary, icon: "check", label: "APPROVED", tone: "primary" };
    case "ordered":
      return { bg: hubTokens.warnSoft, fg: hubTokens.warn, icon: "receipt", label: "ORDERED", tone: "warn" };
    case "delivered":
      return { bg: hubTokens.primarySoft, fg: hubTokens.primary, icon: "download", label: "DELIVERED", tone: "primary" };
    case "settled":
      return { bg: hubTokens.successSoft, fg: hubTokens.success, icon: "check", label: "SETTLED", tone: "success" };
    case "in-use":
      return { bg: hubTokens.primarySoft, fg: hubTokens.primary, icon: "trend", label: "IN USE", tone: "primary" };
    case "exhausted":
      return { bg: hubTokens.hairline, fg: hubTokens.subtle, icon: "check", label: "EXHAUSTED", tone: "neutral" };
    case "rejected":
      return { bg: hubTokens.dangerSoft, fg: hubTokens.danger, icon: "x", label: "REJECTED", tone: "danger" };
    default:
      return { bg: hubTokens.chip, fg: hubTokens.muted, icon: "plus", label: stage.toUpperCase(), tone: "neutral" };
  }
}

/**
 * Pipeline progress index — how far the thread has advanced in M_STAGES.
 * `rejected` returns -1 (treated as no progress for the pipeline UI).
 */
export function stageIndex(stage: ThreadStage): number {
  if (stage === "rejected") return -1;
  if (stage === "in-transit") return M_STAGES.indexOf("ordered");
  return M_STAGES.indexOf(stage);
}
