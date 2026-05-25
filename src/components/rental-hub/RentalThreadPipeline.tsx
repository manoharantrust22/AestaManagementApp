"use client";

/**
 * Per-row mini timeline for the Rental Hub. Five stages horizontally:
 * Request · Confirm · Active · Returned · Settled.
 *
 * Overdue rule (spec lines 196-198): the current stage circle AND the
 * just-passed line both flip to danger red when the order is overdue.
 *
 * Cancelled rule (spec line 199): all 5 dots muted gray, no current stage.
 */

import { Box } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import { hubTokens } from "@/lib/material-hub/tokens";
import {
  VISIBLE_STAGES,
  stageIndex,
  visibleStageForThread,
} from "@/lib/rental-hub/stageHelpers";
import type { RentalThread } from "@/lib/rental-hub/threadTypes";

const PULSE_KEYFRAMES = `
@keyframes matPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(0.6); opacity: 0.6; }
}
`;

interface StageDotProps {
  done: boolean;
  current: boolean;
  accent: string;
  softAccent: string;
  muted?: boolean;
  /** Terminal completion (settled): green ring + green dot + check. */
  completedSuccess?: boolean;
}

function StageDot({
  done,
  current,
  accent,
  softAccent,
  muted,
  completedSuccess,
}: StageDotProps) {
  if (muted) {
    return (
      <Box
        sx={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: hubTokens.hairline,
          border: `2px solid ${hubTokens.border}`,
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <Box
      sx={{
        width: 14,
        height: 14,
        borderRadius: "50%",
        background: completedSuccess
          ? hubTokens.success
          : done
            ? current
              ? accent
              : hubTokens.text
            : "#fff",
        border:
          completedSuccess || done ? "none" : `2px solid ${hubTokens.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: completedSuccess
          ? `0 0 0 4px ${hubTokens.successSoft}`
          : current
            ? `0 0 0 4px ${softAccent}`
            : "none",
        flexShrink: 0,
      }}
    >
      {completedSuccess ? (
        <CheckIcon sx={{ fontSize: 9, color: "#fff", strokeWidth: 3 }} />
      ) : done && current ? (
        <Box
          sx={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "#fff",
            animation: "matPulse 1.6s ease-in-out infinite",
          }}
        />
      ) : done ? (
        <CheckIcon sx={{ fontSize: 9, color: "#fff", strokeWidth: 3 }} />
      ) : null}
    </Box>
  );
}

interface StageLabelProps {
  text: string;
  done: boolean;
  current: boolean;
  accent: string;
  muted?: boolean;
  completedSuccess?: boolean;
}

function StageLabel({
  text,
  done,
  current,
  accent,
  muted,
  completedSuccess,
}: StageLabelProps) {
  return (
    <Box
      component="span"
      sx={{
        fontSize: 9,
        fontWeight: current || completedSuccess ? 700 : 600,
        color: completedSuccess
          ? hubTokens.success
          : muted
            ? hubTokens.subtle
            : done
              ? current
                ? accent
                : hubTokens.muted
              : hubTokens.subtle,
        letterSpacing: "0.2px",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </Box>
  );
}

export interface RentalThreadPipelineProps {
  thread: RentalThread;
}

export default function RentalThreadPipeline({ thread }: RentalThreadPipelineProps) {
  const stage = visibleStageForThread(thread);
  const cancelled = thread.isCancelled;
  const overdue = thread.isOverdue && !cancelled;
  const idx = stageIndex(stage);

  // Overdue: accent for the current dot + just-passed line = danger
  const accent = overdue ? hubTokens.danger : hubTokens.primary;
  const softAccent = overdue ? hubTokens.dangerSoft : hubTokens.primarySoft;

  return (
    <Box sx={{ display: "flex", alignItems: "center", height: 30 }}>
      <style>{PULSE_KEYFRAMES}</style>
      {VISIBLE_STAGES.map((s, i) => {
        const done = !cancelled && idx >= 0 && i <= idx;
        const current = !cancelled && s.key === stage;
        // SETTLED is a terminal completion — flip to green DONE (mirrors
        // Materials Hub's exhausted-→-DONE pattern). Suppresses the pulsing
        // current indicator since there is no "next" step.
        const completedSuccess =
          !cancelled && s.key === "settled" && stage === "settled";
        const labelText = completedSuccess ? "DONE" : s.label;
        const dotCurrent = completedSuccess ? false : current;
        const isLast = i === VISIBLE_STAGES.length - 1;
        const nextDone = !isLast && !cancelled && idx >= 0 && i + 1 <= idx;
        // Just-passed line flips to danger when overdue (spec line 197)
        const lineIsJustPassed = current && !completedSuccess;
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
                current={dotCurrent}
                accent={accent}
                softAccent={softAccent}
                muted={cancelled}
                completedSuccess={completedSuccess}
              />
              <StageLabel
                text={labelText}
                done={done}
                current={dotCurrent}
                accent={accent}
                muted={cancelled}
                completedSuccess={completedSuccess}
              />
            </Box>
            {!isLast && (
              <Box
                sx={{
                  flex: 1,
                  height: 2,
                  marginBottom: "14px",
                  minWidth: 14,
                  background: cancelled
                    ? hubTokens.hairline
                    : overdue && lineIsJustPassed
                      ? hubTokens.danger
                      : nextDone
                        ? hubTokens.text
                        : hubTokens.hairline,
                }}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}
