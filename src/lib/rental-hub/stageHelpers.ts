/**
 * Stage helpers for the Rental Hub v2 5-stage pipeline.
 *
 * The production rental_orders.status enum has 8 values; the hub collapses
 * them to 5 visible stages per docs/RentalHub_V2_redesign/README.md (lines
 * 180-200):
 *
 *   pending | approved | draft        → request
 *   confirmed                          → confirm
 *   active | partially_returned        → active
 *   completed (settlements pending)    → returned
 *   completed (all settlements done)   → settled  (synthesized as effective_status)
 *   cancelled                          → not in pipeline (returns null)
 *
 * effective_status is computed in threadAdapter.ts. This file only consumes it.
 */

import type { RentalEffectiveStatus, RentalStage, RentalThread } from "./threadTypes";

export interface RentalStageSpec {
  key: RentalStage;
  label: string;
}

export const VISIBLE_STAGES: readonly RentalStageSpec[] = [
  { key: "request", label: "REQUEST" },
  { key: "confirm", label: "CONFIRM" },
  { key: "active", label: "ACTIVE" },
  { key: "returned", label: "RETURNED" },
  { key: "settled", label: "SETTLED" },
] as const;

export function visibleStageForStatus(
  status: RentalEffectiveStatus,
): RentalStage | null {
  switch (status) {
    case "pending":
    case "approved":
    case "draft":
      return "request";
    case "confirmed":
      return "confirm";
    case "active":
    case "partially_returned":
      return "active";
    case "completed":
      return "returned";
    case "settled":
      return "settled";
    case "cancelled":
      return null;
    default:
      return null;
  }
}

export function visibleStageForThread(t: RentalThread): RentalStage | null {
  if (t.isCancelled) return null;
  return visibleStageForStatus(t.effective_status);
}

export function stageIndex(stage: RentalStage | null): number {
  if (stage == null) return -1;
  return VISIBLE_STAGES.findIndex((s) => s.key === stage);
}

export function stageLabel(stage: RentalStage): string {
  return VISIBLE_STAGES.find((s) => s.key === stage)?.label ?? "";
}

/**
 * Pill background/text tone keys (consumed by hubTokens.toneColors in the row).
 * Mirrors materials' stagePillSpec pattern.
 */
export type StageTone = "primary" | "warn" | "success" | "danger" | "muted";

export function stagePillTone(stage: RentalStage | null, isOverdue: boolean): StageTone {
  if (stage == null) return "muted"; // cancelled
  if (isOverdue) return "danger";
  switch (stage) {
    case "request":
    case "confirm":
    case "active":
      return "primary";
    case "returned":
      return "warn";
    case "settled":
      return "success";
    default:
      return "primary";
  }
}

/**
 * Color for the left 4px band on the thread row card.
 *   - Settled → success
 *   - Overdue → danger
 *   - Returned (completed, awaiting settle) → warn
 *   - Group cluster → pink
 *   - Otherwise → primary
 *   - Cancelled → muted gray
 */
export type BandTone = "success" | "danger" | "warn" | "pink" | "primary" | "muted";

export function bandTone(t: RentalThread): BandTone {
  if (t.isCancelled) return "muted";
  if (t.effective_status === "settled") return "success";
  if (t.isOverdue) return "danger";
  if (t.effective_status === "completed") return "warn";
  if (t.kind === "group") return "pink";
  return "primary";
}
