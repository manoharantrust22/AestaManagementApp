"use client";

/**
 * Per-row mini timeline. Six stages horizontally: Req · Approve · PO · Deliver
 * · Settle · In use. Spot purchases render a shorter 2- or 3-stage pipeline in
 * warn color.
 *
 * Mirrors `ProtoThreadPipeline` in docs/MaterialHub_Redesign/proto-screens.jsx.
 */

import { Box } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import { hubTokens } from "@/lib/material-hub/tokens";
import { M_STAGES, VISIBLE_STAGES, stageIndex } from "@/lib/material-hub/stageHelpers";
import type { MaterialThread, ThreadStage } from "@/lib/material-hub/threadTypes";

const PULSE_KEYFRAMES = `
@keyframes matPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(0.6); opacity: 0.6; }
}
`;

interface StageDotProps {
  done: boolean;
  current: boolean;
  /** 0–1. When between 0 and 1, renders as a partial-progress arc. */
  progress?: number;
  accent: string;
  softAccent: string;
}

function StageDot({
  done,
  current,
  progress,
  accent,
  softAccent,
  /** Renders the dot as a green-check "done & terminal" state — used for the
   *  last visible step when the thread is exhausted (fully consumed). */
  completedSuccess,
}: StageDotProps & { completedSuccess?: boolean }) {
  const isPartial =
    !done && progress != null && progress > 0 && progress < 1;
  return (
    <Box
      sx={{
        width: 14,
        height: 14,
        borderRadius: "50%",
        // completedSuccess → green check; done → filled black; partial → conic;
        // next-pending → accent fill; future → outlined.
        background: completedSuccess
          ? hubTokens.success
          : done
            ? hubTokens.text
            : isPartial
              ? `conic-gradient(${accent} ${Math.round((progress ?? 0) * 360)}deg, ${hubTokens.hairline} 0deg)`
              : current
                ? accent
                : "#fff",
        border:
          completedSuccess || done || isPartial || current
            ? "none"
            : `2px solid ${hubTokens.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow:
          completedSuccess
            ? `0 0 0 4px ${hubTokens.successSoft}`
            : current || isPartial
              ? `0 0 0 4px ${softAccent}`
              : "none",
        flexShrink: 0,
        position: "relative",
      }}
    >
      {completedSuccess || done ? (
        <CheckIcon sx={{ fontSize: 9, color: "#fff", strokeWidth: 3 }} />
      ) : isPartial ? (
        // Inner white circle on top of the conic gradient creates a ring
        <Box
          sx={{
            position: "absolute",
            inset: 3,
            borderRadius: "50%",
            background: "#fff",
          }}
        />
      ) : current ? (
        <Box
          sx={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "#fff",
            animation: "matPulse 1.6s ease-in-out infinite",
          }}
        />
      ) : null}
    </Box>
  );
}

interface StageLabelProps {
  text: string;
  done: boolean;
  current: boolean;
  accent: string;
}

function StageLabel({ text, done, current, accent }: StageLabelProps) {
  return (
    <Box
      component="span"
      sx={{
        fontSize: 9,
        fontWeight: current ? 700 : 600,
        color: done ? (current ? accent : hubTokens.muted) : hubTokens.subtle,
        letterSpacing: "0.2px",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </Box>
  );
}

export interface MaterialThreadPipelineProps {
  thread: MaterialThread;
}

export default function MaterialThreadPipeline({ thread }: MaterialThreadPipelineProps) {
  if (thread.purchase_type === "spot") {
    const stages: { key: string; label: string; done: boolean; current: boolean }[] = [
      { key: "bought", label: "Bought", done: true, current: false },
      {
        key: "inuse",
        label: "In use",
        done: true,
        current: thread.kind === "own" || thread.spot_stage === "finalized",
      },
    ];
    if (thread.kind === "group") {
      stages.push({
        key: "finalize",
        label: "Finalize",
        done: thread.spot_stage === "finalized",
        current: thread.spot_stage === "provisional",
      });
    }
    return (
      <Box sx={{ display: "flex", alignItems: "center", height: 30 }}>
        <style>{PULSE_KEYFRAMES}</style>
        {stages.map((s, i) => {
          const isLast = i === stages.length - 1;
          return (
            <Box key={s.key} sx={{ display: "contents" }}>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "3px",
                  flexShrink: 0,
                }}
              >
                <StageDot
                  done={s.done}
                  current={s.current}
                  accent={hubTokens.warn}
                  softAccent={hubTokens.warnSoft}
                />
                <StageLabel
                  text={s.label}
                  done={s.done}
                  current={s.current}
                  accent={hubTokens.warn}
                />
              </Box>
              {!isLast && (
                <Box
                  sx={{
                    flex: 1,
                    height: 2,
                    marginBottom: "14px",
                    minWidth: 14,
                    background: stages[i + 1].done ? hubTokens.text : hubTokens.hairline,
                  }}
                />
              )}
            </Box>
          );
        })}
      </Box>
    );
  }

  // Standard flow: 6-stage pipeline
  // `done` = stage already completed (filled black with check)
  // `current` = the NEXT pending stage (pulsing accent, "do this next")
  // `progress` = 0..1 partial progress (DELIVER step when partial_delivered)
  // Terminal states (rejected/in-use/exhausted) have no "next" pulse.
  const idx = stageIndex(thread.stage);
  const isTerminal =
    thread.stage === "rejected" ||
    thread.stage === "in-use" ||
    thread.stage === "exhausted";
  const nextKey =
    !isTerminal && idx + 1 < M_STAGES.length ? M_STAGES[idx + 1] : null;

  // Per-stage overrides for the standard pipeline based on PO state.
  const po = thread.po;
  const orderedQty = po?.qty ?? 0;
  const receivedQty = po?.received_qty ?? 0;
  const isAdvancePaid =
    !!po && po.payment_timing === "advance" && po.advance_paid > 0;
  const deliverFraction =
    po && orderedQty > 0 ? Math.min(receivedQty / orderedQty, 1) : 0;
  const deliverFullyDone = deliverFraction >= 1;

  // Override: SETTLE shows as DONE for advance POs from the moment advance was paid.
  // Override: DELIVER label shows fraction (e.g. "DELIVER 80/200").
  // Override: when DELIVER is partial and stage is still "ordered", DELIVER is the
  //           current-pending (with progress shown); pulse stays on the DELIVER dot.
  const settleDoneByAdvance =
    isAdvancePaid && (!thread.settlement || thread.settlement.status !== "settled");

  // Inventory step state (synthetic, not a real ThreadStage). The DB trigger
  // adds delivered material to stock_inventory automatically — so STOCK is
  // "done" whenever we have evidence of delivery, even if the inventory row
  // hasn't been picked up by this query yet (older POs sometimes have
  // PO.status='delivered' but per-item received_qty=0 due to legacy verify
  // flows; the material still made it into the bucket).
  const inv = thread.inventory;
  const hasReceivedQty = !!po && receivedQty > 0;
  const hasBatches =
    !!po && Array.isArray(po.delivery_batches) && po.delivery_batches.length > 0;
  const inventoryDone =
    (!!inv && inv.received > 0) || hasReceivedQty || hasBatches;

  return (
    <Box sx={{ display: "flex", alignItems: "center", height: 30 }}>
      <style>{PULSE_KEYFRAMES}</style>
      {VISIBLE_STAGES.map((s, i) => {
        // Synthetic "inventory" step: not in M_STAGES; derive done from thread.inventory.
        if (s.key === "inventory") {
          const isLast = i === VISIBLE_STAGES.length - 1;
          const nextStageKey = VISIBLE_STAGES[i + 1]?.key;
          const nextDone =
            nextStageKey && nextStageKey !== "inventory"
              ? M_STAGES.indexOf(nextStageKey as ThreadStage) <= idx
              : false;
          return (
            <Box key={s.key} sx={{ display: "contents" }}>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "3px",
                  flexShrink: 0,
                }}
              >
                <StageDot
                  done={inventoryDone}
                  current={false}
                  accent={hubTokens.primary}
                  softAccent={hubTokens.primarySoft}
                />
                <StageLabel
                  // Only show batch-specific numbers when the match is
                  // batch-exact (inv.batch !== "—"). Shared-pool fallbacks
                  // describe the entire site bucket, not this thread — so
                  // showing "0/20" there misrepresents the per-thread state.
                  text={
                    inv && inv.received > 0 && inv.batch !== "—"
                      ? `STOCK ${Math.round(inv.remaining)}/${Math.round(inv.received)}`
                      : "STOCK"
                  }
                  done={inventoryDone}
                  current={false}
                  accent={hubTokens.primary}
                />
              </Box>
              {!isLast && (
                <Box
                  sx={{
                    flex: 1,
                    height: 2,
                    marginBottom: "14px",
                    minWidth: 14,
                    background: nextDone ? hubTokens.text : hubTokens.hairline,
                  }}
                />
              )}
            </Box>
          );
        }

        const stageKey = s.key as ThreadStage;
        let done = M_STAGES.indexOf(stageKey) <= idx;
        let current = stageKey === nextKey;
        let progress: number | undefined;
        let labelText: string = s.label;
        // Mark the final IN USE step as a green "DONE" when the batch is
        // exhausted. Easier to scan than "IN USE with a filled black check"
        // because it conveys terminal completion at a glance.
        let completedSuccess = false;
        if (stageKey === "in-use" && thread.stage === "exhausted") {
          completedSuccess = true;
          done = true;
          current = false;
          labelText = "DONE";
        }

        // DELIVER: show partial-progress arc + fraction label
        if (stageKey === "delivered" && po && receivedQty > 0 && !deliverFullyDone) {
          progress = deliverFraction;
          labelText = `${s.label} ${Math.round(receivedQty)}/${Math.round(orderedQty)}`;
          // Keep the pulse on DELIVER while partial (the engineer's next action
          // is to record the next batch, not to advance to SETTLE).
          current = true;
        }
        // SETTLE: mark done for advance-paid POs even before delivery completes.
        if (stageKey === "settled" && settleDoneByAdvance) {
          done = true;
          labelText = "SETTLE · advance";
          // If we marked SETTLE done by advance, the pulse should NOT sit on SETTLE.
          if (stageKey === nextKey) current = false;
        }

        const isLast = i === VISIBLE_STAGES.length - 1;
        const nextVisibleKey = VISIBLE_STAGES[i + 1]?.key;
        const nextDone =
          !isLast && nextVisibleKey !== "inventory"
            ? M_STAGES.indexOf(nextVisibleKey as ThreadStage) <= idx
            : !isLast && nextVisibleKey === "inventory"
              ? inventoryDone
              : false;
        return (
          <Box key={s.key} sx={{ display: "contents" }}>
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "3px",
                flexShrink: 0,
              }}
            >
              <StageDot
                done={done}
                current={current}
                progress={progress}
                accent={hubTokens.primary}
                softAccent={hubTokens.primarySoft}
                completedSuccess={completedSuccess}
              />
              <StageLabel
                text={labelText}
                done={done}
                current={current}
                accent={completedSuccess ? hubTokens.success : hubTokens.primary}
              />
            </Box>
            {!isLast && (
              <Box
                sx={{
                  flex: 1,
                  height: 2,
                  marginBottom: "14px",
                  minWidth: 14,
                  background: nextDone ? hubTokens.text : hubTokens.hairline,
                }}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}