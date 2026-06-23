"use client";

/**
 * Per-row mini timeline. Seven visible stages horizontally: Req · Approve ·
 * PO · Deliver · Stock · Settle · In use — except advance-paid POs, where the
 * vendor is settled upfront so the order becomes Req · Approve · PO · Settle ·
 * Deliver · Stock · In use. Spot purchases render a shorter 2- or 3-stage
 * pipeline in warn colour.
 *
 * This file owns only the STATE derivation; the visuals come from the shared
 * {@link HubPipelineStepper} ("Material rail"). INTER-SITE is no longer a rail
 * node — it renders as a compact chip below the rail so the seven core columns
 * stay aligned across every row.
 *
 * `buildMaterialPipeline` is the single source of truth for a thread's stage
 * states; the desktop rail and the mobile summary bar (MaterialThreadRow) both
 * consume it.
 */

import { Box } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import { hubTokens } from "@/lib/material-hub/tokens";
import { fmtQty } from "@/lib/formatters";
import {
  M_STAGES,
  getVisibleStages,
  stageIndex,
  advanceAwaitingSettle,
} from "@/lib/material-hub/stageHelpers";
import type { MaterialThread, ThreadStage } from "@/lib/material-hub/threadTypes";
import {
  type InterSiteStatus,
  isInterSiteOutstanding,
} from "@/lib/material-hub/interSiteStatus";
import HubPipelineStepper, {
  hubPulse,
  type HubStep,
  type HubStepState,
} from "@/components/common/HubPipelineStepper";

/**
 * Inter-site chip sub-state (more granular than the rail node, which is just
 * "outstanding/amber" vs "done/green"):
 *  - `settled`  → green ✓, debt paid + per-site expense posted.
 *  - `settle`   → amber pulse, cross-site usage logged but no settlement raised
 *                 yet (your next step is to reconcile / generate).
 *  - `awaiting` → blue, a settlement WAS raised but is not yet paid (your next
 *                 step is to record the payment / net it). NOT "settled".
 *  - `dormant`  → faint, debt exists but the material isn't exhausted yet.
 */
export type InterSiteChipState = "settled" | "settle" | "awaiting" | "dormant";

export interface MaterialPipelineModel {
  steps: HubStep[];
  accent: string;
  softAccent: string;
  lineActiveColor?: string;
  /** Inter-site chip state, or null when the thread has no cross-site debt. */
  interSite: InterSiteChipState | null;
}

/**
 * Resolve a thread's inter-site lifecycle state. Prefers the explicit
 * `inter_site_status` set by the thread builder; falls back to the legacy
 * `inter_site_applicable`/`inter_site_pending` booleans for older callers and
 * tests. The fallback can only distinguish settled-vs-not, so an unpaid raised
 * settlement degrades to `pending_usage` — still "outstanding", never "settled".
 */
function resolveInterSiteStatus(thread: MaterialThread): InterSiteStatus {
  if (thread.inter_site_status) return thread.inter_site_status;
  if (!thread.inter_site_applicable) return "none";
  return thread.inter_site_pending ? "pending_usage" : "settled";
}

/** Derive the full stage model for a thread (shared by desktop rail + mobile bar). */
export function buildMaterialPipeline(thread: MaterialThread): MaterialPipelineModel {
  if (thread.purchase_type === "spot") {
    const finalized = thread.spot_stage === "finalized";
    const steps: HubStep[] = [{ key: "bought", label: "BOUGHT", state: "done" }];
    if (thread.kind === "own") {
      steps.push({ key: "inuse", label: "IN USE", state: "current" });
    } else {
      steps.push({ key: "inuse", label: "IN USE", state: "done" });
      steps.push({
        key: "finalize",
        label: "FINALIZE",
        state: finalized ? "success" : "current",
      });
    }
    return {
      steps,
      accent: hubTokens.warn,
      softAccent: hubTokens.warnSoft,
      lineActiveColor: hubTokens.warn,
      interSite: null,
    };
  }

  // Standard flow: 7-stage pipeline.
  // `done` = stage already completed · `current` = the NEXT pending stage
  // (pulsing) · `progress` = 0..1 partial (DELIVER when partially delivered).
  // Terminal states (rejected/in-use/exhausted) have no "next" pulse.
  const idx = stageIndex(thread.stage);
  const isTerminal =
    thread.stage === "rejected" ||
    thread.stage === "in-use" ||
    thread.stage === "exhausted";

  // The material is fully consumed but the cross-site debt is still unfinished
  // (either no settlement raised yet, OR one raised but not paid) — the thread
  // is NOT done. The terminal node becomes a pending INTER-SITE step (amber)
  // instead of a premature green DONE. Crucially this stays amber through the
  // `raised_unpaid` state: generating a settlement moves no money, so the card
  // must not flip to green until it is actually paid + the expense is split.
  const interSiteStatus = resolveInterSiteStatus(thread);
  const interSiteActive =
    isInterSiteOutstanding(interSiteStatus) && thread.stage === "exhausted";
  let nextKey =
    !isTerminal && idx + 1 < M_STAGES.length ? M_STAGES[idx + 1] : null;

  const po = thread.po;
  const orderedQty = po?.qty ?? 0;
  const receivedQty = po?.received_qty ?? 0;
  const isAdvancePaid =
    !!po && po.payment_timing === "advance" && po.advance_paid > 0;

  // Bulk/advance PO not yet paid: the vendor is settled BEFORE delivery, so the
  // pulsing "current" step is SETTLE — not DELIVER. Redirecting nextKey makes
  // SETTLE pulse and DELIVER go quiet via the `current = stageKey === nextKey`
  // rule below; no other change is needed for the no-delivery case.
  const needsSettleFirst = advanceAwaitingSettle(thread);
  if (needsSettleFirst) nextKey = "settled";
  const deliverFraction =
    po && orderedQty > 0 ? Math.min(receivedQty / orderedQty, 1) : 0;
  const deliverFullyDone = deliverFraction >= 1;

  // SETTLE shows as DONE for advance POs from the moment the advance was paid.
  const settleDoneByAdvance =
    isAdvancePaid && (!thread.settlement || thread.settlement.status !== "settled");

  // Inventory (synthetic). The DB trigger adds delivered material to stock, so
  // STOCK is "done" whenever there's evidence of delivery even if the inventory
  // row hasn't been picked up by this query yet.
  const inv = thread.inventory;
  const hasReceivedQty = !!po && receivedQty > 0;
  const hasBatches =
    !!po && Array.isArray(po.delivery_batches) && po.delivery_batches.length > 0;
  const inventoryDone =
    (!!inv && inv.received > 0) || hasReceivedQty || hasBatches;

  const steps: HubStep[] = getVisibleStages(thread.advance).map((s) => {
    // Synthetic STOCK step.
    if (s.key === "inventory") {
      // Only show batch-exact counts. A shared-pool fallback (batch === "—")
      // describes the whole site bucket, not this thread.
      const caption =
        inv && inv.received > 0 && inv.batch !== "—"
          ? `${fmtQty(inv.remaining)}/${fmtQty(inv.received)}`
          : undefined;
      return {
        key: s.key,
        label: "STOCK",
        caption,
        state: inventoryDone ? "done" : "upcoming",
      };
    }

    const stageKey = s.key as ThreadStage;
    let done = M_STAGES.indexOf(stageKey) <= idx;
    let current = stageKey === nextKey;
    let progress: number | undefined;
    let caption: string | undefined;
    let label = s.label;
    let success = false;

    // IN USE: exhausted → terminal DONE, EXCEPT when a cross-site debt is still
    // unsettled — then the thread isn't actually finished, so the terminal node
    // becomes a pending INTER-SITE step (amber pulse) rather than a green DONE.
    if (stageKey === "in-use" && thread.stage === "exhausted") {
      if (interSiteActive) {
        current = true;
        done = false;
        success = false;
        label = "INTER-SITE";
      } else {
        success = true;
        done = true;
        current = false;
        label = "DONE";
      }
    } else if (stageKey === "in-use" && thread.stage === "in-use") {
      done = false;
      current = true;
      const recv = inv?.received ?? 0;
      const usedQty = inv?.used ?? 0;
      if (inv && recv > 0 && usedQty > 0 && usedQty < recv && inv.batch !== "—") {
        caption = `${fmtQty(usedQty)}/${fmtQty(recv)}`;
      }
    }

    // DELIVER: partial-progress arc + fraction caption; keep the pulse here —
    // unless the vendor still has to be settled first (a rare pre-settlement
    // partial), in which case SETTLE keeps the pulse and DELIVER just shows the
    // progress arc without stealing "current".
    if (stageKey === "delivered" && po && receivedQty > 0 && !deliverFullyDone) {
      progress = deliverFraction;
      caption = `${fmtQty(receivedQty)}/${fmtQty(orderedQty)}`;
      if (!needsSettleFirst) current = true;
    }

    // SETTLE: done once the vendor is actually settled (status='settled'),
    // independent of the thread's lifecycle position — an advance batch can be
    // settled while still only partially delivered, so M_STAGES position
    // (stuck at 'delivered') would otherwise leave SETTLE looking empty even
    // though the card reads SETTLED. The advance-paid fallback marks SETTLE
    // done from the upfront payment, before the settlement row exists.
    if (stageKey === "settled") {
      if (thread.settlement?.status === "settled") {
        done = true;
        current = false;
      } else if (settleDoneByAdvance) {
        done = true;
        caption = "advance";
        if (stageKey === nextKey) current = false;
      }
    }

    const state: HubStepState = success
      ? "success"
      : current
        ? "current"
        : done
          ? "done"
          : "upcoming";
    return { key: s.key, label, caption, progress, state };
  });

  // Inter-site (synthetic chip below the rail):
  //   settled       → green ✓
  //   raised_unpaid → blue "Raised · awaiting payment" (settlement exists, unpaid)
  //   pending+exhausted → amber pulse "Settle inter-site" (raise it now)
  //   pending+in-use    → faint "Inter-site pending" (debt exists but not yet due)
  // The exhausted+outstanding state is ALSO carried on the rail's terminal node
  // (amber INTER-SITE) — the chip is the action-labelled echo, the only
  // inter-site cue on the mobile segment bar, which has no node labels.
  let interSite: InterSiteChipState | null = null;
  if (interSiteStatus !== "none") {
    interSite =
      interSiteStatus === "settled"
        ? "settled"
        : interSiteStatus === "raised_unpaid"
          ? "awaiting"
          : thread.stage === "exhausted"
            ? "settle"
            : "dormant";
  }

  // When the terminal node is the amber INTER-SITE step, recolour the rail
  // (node pulse + reached line) to warn. Safe: an exhausted thread has no other
  // `current` node, so nothing else turns amber.
  return {
    steps,
    accent: interSiteActive ? hubTokens.warn : hubTokens.primary,
    softAccent: interSiteActive ? hubTokens.warnSoft : hubTokens.primarySoft,
    lineActiveColor: interSiteActive ? hubTokens.warn : undefined,
    interSite,
  };
}

export interface MaterialThreadPipelineProps {
  thread: MaterialThread;
}

export default function MaterialThreadPipeline({ thread }: MaterialThreadPipelineProps) {
  const model = buildMaterialPipeline(thread);
  return (
    <HubPipelineStepper
      steps={model.steps}
      accent={model.accent}
      softAccent={model.softAccent}
      lineActiveColor={model.lineActiveColor}
      trailing={
        model.interSite ? <InterSiteChip state={model.interSite} /> : undefined
      }
    />
  );
}

// ----------------------------------------------------------------------------
// Inter-site status chip (rendered below the rail)
// ----------------------------------------------------------------------------

export function InterSiteChip({ state }: { state: InterSiteChipState }) {
  const spec =
    state === "settled"
      ? { bg: hubTokens.successSoft, fg: hubTokens.success, label: "Inter-site settled" }
      : state === "settle"
        ? { bg: hubTokens.warnSoft, fg: hubTokens.warn, label: "Settle inter-site" }
        : state === "awaiting"
          ? { bg: hubTokens.primarySoft, fg: hubTokens.primary, label: "Raised · awaiting payment" }
          : { bg: hubTokens.chip, fg: hubTokens.subtle, label: "Inter-site pending" };

  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "2px 8px",
        borderRadius: "6px",
        background: spec.bg,
        color: spec.fg,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.2px",
        lineHeight: "16px",
        textTransform: "uppercase",
      }}
    >
      {state === "settled" ? (
        <CheckIcon sx={{ fontSize: 11 }} />
      ) : (
        <Box
          component="span"
          sx={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: spec.fg,
            // Only the un-raised "settle" state pulses (it's the step you must
            // start). "awaiting" is raised and in-progress → steady dot.
            animation:
              state === "settle"
                ? `${hubPulse} 1.6s ease-in-out infinite`
                : "none",
          }}
        />
      )}
      {spec.label}
    </Box>
  );
}
