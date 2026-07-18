"use client";

/**
 * MaterialHubStageStepper — the Hub's hero filter.
 *
 * A compact, clickable stepper of the condensed actionable steps
 * (PO · DELIVER · SETTLE · IN USE — Approve + PO are one combined office
 * step). Each node IS the bucket count and
 * is tinted by the role on the hook (admin → pink, engineer → blue, office →
 * amber); a small caption reads "N to <verb>" when work is waiting. Click a step
 * to filter the list to threads sitting there; click it again to clear.
 *
 * Visually echoes the per-row `HubPipelineStepper` (rail + circular nodes,
 * `hubTokens`) but, unlike it, every node is an independent toggle with its own
 * colour and a selected state — which `HubPipelineStepper`'s single-accent,
 * progress-driven model can't express — so this is a purpose-built component.
 */

import * as React from "react";
import { Box, Typography } from "@mui/material";
import { hubTokens, hubToneColors, type HubTone } from "@/lib/material-hub/tokens";
import {
  STAGE_STEPS,
  dominantRole,
  ROLE_LABEL,
  type StageStepKey,
  type StageStepCounts,
  type StepRole,
} from "@/lib/material-hub/stageFilter";

const NODE = 30;

const ROLE_TONE: Record<StepRole, HubTone> = {
  admin: "pink",
  engineer: "primary",
  office: "warn",
};

export interface MaterialHubStageStepperProps {
  counts: StageStepCounts;
  selected: StageStepKey | null;
  /** Receives the new selection (null when the active step is toggled off). */
  onSelect: (key: StageStepKey | null) => void;
}

export default function MaterialHubStageStepper({
  counts,
  selected,
  onSelect,
}: MaterialHubStageStepperProps) {
  return (
    <Box sx={{ width: "100%", minWidth: 0 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "baseline",
          gap: 1,
          mb: 0.75,
        }}
      >
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.6px",
            textTransform: "uppercase",
            color: hubTokens.muted,
          }}
        >
          Stage
        </Typography>
        <Typography sx={{ fontSize: 11, color: hubTokens.subtle }}>
          {selected ? "tap again to clear" : "tap a step to filter"}
        </Typography>
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          overflowX: "auto",
          // hide the scrollbar but keep scrollability on mobile
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        {STAGE_STEPS.map((step, i) => {
          const count = counts[step.key];
          const has = count.total > 0;
          const isSelected = selected === step.key;
          const role = dominantRole(step, count);
          const tone = ROLE_TONE[role];
          const colors = hubToneColors(tone);
          const actionable = count.action.total;

          return (
            <React.Fragment key={step.key}>
              {i > 0 && (
                <Box
                  aria-hidden
                  sx={{
                    flex: 1,
                    minWidth: 16,
                    height: 2,
                    borderRadius: 1,
                    background: hubTokens.hairline,
                    mt: `${NODE / 2 - 1}px`,
                  }}
                />
              )}

              <Box
                component="button"
                type="button"
                onClick={() => onSelect(isSelected ? null : step.key)}
                aria-pressed={isSelected}
                aria-label={
                  actionable > 0
                    ? `Filter: ${count.total} at ${step.label}, ${actionable} need ${ROLE_LABEL[role]}`
                    : `Filter: ${count.total} at ${step.label}`
                }
                sx={{
                  flex: "0 0 auto",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 0.5,
                  px: 0.5,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: hubTokens.font,
                  opacity: selected && !isSelected ? 0.55 : 1,
                  transition: "opacity .12s",
                  "&:hover .hub-stage-node": {
                    boxShadow: `0 0 0 4px ${colors.bg}`,
                  },
                }}
              >
                <Box
                  className="hub-stage-node"
                  sx={{
                    width: NODE,
                    height: NODE,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: hubTokens.mono,
                    fontWeight: 700,
                    fontSize: count.total > 99 ? 11 : 13,
                    lineHeight: 1,
                    transition: "background .15s, box-shadow .15s, color .15s",
                    background: isSelected
                      ? colors.fg
                      : has
                        ? colors.bg
                        : hubTokens.hairline,
                    color: isSelected
                      ? "#fff"
                      : has
                        ? colors.fg
                        : hubTokens.subtle,
                    boxShadow: isSelected ? `0 0 0 4px ${colors.bg}` : "none",
                  }}
                >
                  {count.total}
                </Box>

                <Box
                  component="span"
                  sx={{
                    fontSize: 10,
                    fontWeight: isSelected ? 700 : 600,
                    letterSpacing: "0.3px",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                    color: isSelected
                      ? colors.fg
                      : has
                        ? hubTokens.text
                        : hubTokens.subtle,
                  }}
                >
                  {step.label}
                </Box>

                <Box
                  component="span"
                  sx={{
                    fontSize: 9.5,
                    lineHeight: 1.1,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    color: actionable > 0 ? colors.fg : hubTokens.subtle,
                  }}
                >
                  {actionable > 0
                    ? `${actionable} to ${step.verb}`
                    : ROLE_LABEL[step.role]}
                </Box>
              </Box>
            </React.Fragment>
          );
        })}
      </Box>
    </Box>
  );
}
