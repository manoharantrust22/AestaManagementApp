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
import { M_STAGES, getVisibleStages, stageIndex } from "@/lib/material-hub/stageHelpers";
import type { MaterialThread, ThreadStage } from "@/lib/material-hub/threadTypes";
import HubPipelineStepper, {
  hubPulse,
  type HubStep,
  type HubStepState,
} from "@/components/common/HubPipelineStepper";

export type InterSiteChipState = "settled" | "active" | "dormant";

export interface MaterialPipelineModel {
  steps: HubStep[];
  accent: string;
  softAccent: string;
  lineActiveColor?: string;
  /** Inter-site chip state, or null when the thread has no cross-site debt. */
  interSite: InterSiteChipState | null;
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
  const nextKey =
    !isTerminal && idx + 1 < M_STAGES.length ? M_STAGES[idx + 1] : null;

  const po = thread.po;
  const orderedQty = po?.qty ?? 0;
  const receivedQty = po?.received_qty ?? 0;
  const isAdvancePaid =
    !!po && po.payment_timing === "advance" && po.advance_paid > 0;
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

    // IN USE: exhausted → terminal green DONE; still being consumed → pulsing.
    if (stageKey === "in-use" && thread.stage === "exhausted") {
      success = true;
      done = true;
      current = false;
      label = "DONE";
    } else if (stageKey === "in-use" && thread.stage === "in-use") {
      done = false;
      current = true;
      const recv = inv?.received ?? 0;
      const usedQty = inv?.used ?? 0;
      if (inv && recv > 0 && usedQty > 0 && usedQty < recv && inv.batch !== "—") {
        caption = `${fmtQty(usedQty)}/${fmtQty(recv)}`;
      }
    }

    // DELIVER: partial-progress arc + fraction caption; keep the pulse here.
    if (stageKey === "delivered" && po && receivedQty > 0 && !deliverFullyDone) {
      progress = deliverFraction;
      caption = `${fmtQty(receivedQty)}/${fmtQty(orderedQty)}`;
      current = true;
    }

    // SETTLE: done for advance-paid POs even before delivery completes.
    if (stageKey === "settled" && settleDoneByAdvance) {
      done = true;
      caption = "advance";
      if (stageKey === nextKey) current = false;
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

  // Inter-site (synthetic): settled → green · pending+exhausted → amber pulse
  // (now your next action) · pending+in-use → faint (debt exists but not due).
  let interSite: InterSiteChipState | null = null;
  if (thread.inter_site_applicable) {
    const pending = !!thread.inter_site_pending;
    const activePending = pending && thread.stage === "exhausted";
    interSite = !pending ? "settled" : activePending ? "active" : "dormant";
  }

  return {
    steps,
    accent: hubTokens.primary,
    softAccent: hubTokens.primarySoft,
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
      : state === "active"
        ? { bg: hubTokens.warnSoft, fg: hubTokens.warn, label: "Settle inter-site" }
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
            animation:
              state === "active"
                ? `${hubPulse} 1.6s ease-in-out infinite`
                : "none",
          }}
        />
      )}
      {spec.label}
    </Box>
  );
}
