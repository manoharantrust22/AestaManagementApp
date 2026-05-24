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
import type { MaterialThread } from "@/lib/material-hub/threadTypes";

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
}

function StageDot({ done, current, accent, softAccent }: StageDotProps) {
  return (
    <Box
      sx={{
        width: 14,
        height: 14,
        borderRadius: "50%",
        background: done ? (current ? accent : hubTokens.text) : "#fff",
        border: done ? "none" : `2px solid ${hubTokens.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: current ? `0 0 0 4px ${softAccent}` : "none",
        flexShrink: 0,
      }}
    >
      {done && current ? (
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
  const idx = stageIndex(thread.stage);
  return (
    <Box sx={{ display: "flex", alignItems: "center", height: 30 }}>
      <style>{PULSE_KEYFRAMES}</style>
      {VISIBLE_STAGES.map((s, i) => {
        const done = M_STAGES.indexOf(s.key) <= idx;
        const current = s.key === thread.stage;
        const isLast = i === VISIBLE_STAGES.length - 1;
        const nextDone = !isLast && M_STAGES.indexOf(VISIBLE_STAGES[i + 1].key) <= idx;
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
                accent={hubTokens.primary}
                softAccent={hubTokens.primarySoft}
              />
              <StageLabel
                text={s.label}
                done={done}
                current={current}
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
      })}
    </Box>
  );
}