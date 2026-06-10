"use client";

/**
 * HubPipelineStepper — the shared "Material rail" progress stepper used by the
 * Material Hub and Rental Hub per-row pipelines.
 *
 * Built on MUI's <Stepper alternativeLabel>: nodes sit on one continuous rail
 * with their labels centered below. Both hubs feed it a normalized list of
 * {@link HubStep} descriptors, so the look stays identical across the app.
 *
 * Why this replaces the old hand-rolled flex dots+connectors:
 *  - Every <Step> is `flex: 1 + minWidth: 0`, so the nodes take an exactly equal
 *    share of the row. Nodes therefore line up in fixed vertical columns down the
 *    list, and a wide caption (e.g. "80/200") can no longer shove a node sideways.
 *  - The connector is positioned by MUI through the node centers (no fragile
 *    `marginBottom` hack).
 *  - Counts live in the small `caption` line under the label, never in the label
 *    itself, so the label width is stable.
 */

import * as React from "react";
import { Box, Stepper, Step, StepLabel, StepConnector, stepConnectorClasses } from "@mui/material";
import type { StepIconProps } from "@mui/material/StepIcon";
import { styled } from "@mui/material/styles";
import { keyframes } from "@mui/system";
import CheckIcon from "@mui/icons-material/Check";
import { hubTokens } from "@/lib/material-hub/tokens";

export type HubStepState = "done" | "current" | "upcoming" | "success" | "muted";

export interface HubStep {
  key: string;
  /** Short, stable label — e.g. "STOCK", "DELIVER". Counts go in `caption`. */
  label: string;
  /** Small line under the label — e.g. "0/30", "80/200", "advance". */
  caption?: string;
  /** 0..1 — renders the node as a partial-progress conic arc. */
  progress?: number;
  state: HubStepState;
}

export interface HubPipelineStepperProps {
  steps: HubStep[];
  /** Node + halo accent for the `current` / partial states. */
  accent: string;
  softAccent: string;
  /** Color of the "reached" rail leading into the current node. Defaults to a
   *  neutral dark rail; pass danger for an overdue rental. */
  lineActiveColor?: string;
  /** Optional content rendered on a compact second line BELOW the rail (e.g. the
   *  inter-site chip). Kept off the rail so the rail is always full-width and the
   *  nodes stay column-aligned across every row. */
  trailing?: React.ReactNode;
}

const NODE = 20;
const CHECK = 13;

/** Shared "now" pulse — reused by hub status chips (e.g. inter-site). */
export const hubPulse = keyframes`
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(0.55); opacity: 0.55; }
`;

/** Extra props we feed the custom node through StepLabel's `slotProps.stepIcon`,
 *  on top of the standard StepIconProps MUI passes (which we ignore). */
type HubStepIconSlotProps = Partial<StepIconProps> & {
  hubState?: HubStepState;
  accent?: string;
  softAccent?: string;
  progress?: number;
};

/** Custom node. Reads its state from slotProps (not MUI's active/completed). */
function HubStepIcon(props: HubStepIconSlotProps) {
  const {
    hubState = "upcoming",
    accent = hubTokens.primary,
    softAccent = hubTokens.primarySoft,
    progress,
  } = props;

  const success = hubState === "success";
  const done = hubState === "done";
  const current = hubState === "current";
  const muted = hubState === "muted";
  const isPartial =
    !done && !success && progress != null && progress > 0 && progress < 1;

  let background: string;
  let border = "none";
  let boxShadow = "none";
  if (success) {
    background = hubTokens.success;
    boxShadow = `0 0 0 4px ${hubTokens.successSoft}`;
  } else if (done) {
    background = hubTokens.text;
  } else if (isPartial) {
    background = `conic-gradient(${accent} ${Math.round(
      (progress ?? 0) * 360,
    )}deg, ${hubTokens.hairline} 0deg)`;
    boxShadow = `0 0 0 4px ${softAccent}`;
  } else if (current) {
    background = accent;
    boxShadow = `0 0 0 4px ${softAccent}`;
  } else if (muted) {
    background = hubTokens.hairline;
    border = `2px solid ${hubTokens.border}`;
  } else {
    background = "#fff";
    border = `2px solid ${hubTokens.border}`;
  }

  return (
    <Box
      sx={{
        width: NODE,
        height: NODE,
        borderRadius: "50%",
        background,
        border,
        boxShadow,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        transition: "background .18s ease, box-shadow .18s ease",
      }}
    >
      {success || done ? (
        <CheckIcon sx={{ fontSize: CHECK, color: "#fff" }} />
      ) : isPartial ? (
        <Box
          sx={{
            position: "absolute",
            inset: 4,
            borderRadius: "50%",
            background: "#fff",
          }}
        />
      ) : current ? (
        <Box
          sx={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#fff",
            animation: `${hubPulse} 1.6s ease-in-out infinite`,
          }}
        />
      ) : null}
    </Box>
  );
}

/** Rail segment. Coloured filled for reached segments, hairline otherwise. */
const HubConnector = styled(StepConnector)(() => ({
  top: NODE / 2,
  left: `calc(-50% + ${NODE / 2 + 7}px)`,
  right: `calc(50% + ${NODE / 2 + 7}px)`,
  [`& .${stepConnectorClasses.line}`]: {
    borderColor: hubTokens.hairline,
    borderTopWidth: 2,
    borderRadius: 1,
    transition: "border-color .18s ease",
  },
  // Connector leading INTO a completed step (the previous nodes are done).
  [`&.${stepConnectorClasses.completed} .${stepConnectorClasses.line}`]: {
    borderColor: "var(--hub-line-done, rgba(0,0,0,0.87))",
  },
  // Connector leading INTO the current node — the just-reached segment.
  [`&.${stepConnectorClasses.active} .${stepConnectorClasses.line}`]: {
    borderColor: "var(--hub-line-active, rgba(0,0,0,0.87))",
  },
}));

function labelColor(state: HubStepState, accent: string): string {
  switch (state) {
    case "success":
      return hubTokens.success;
    case "current":
      return accent;
    case "done":
      return hubTokens.muted;
    case "muted":
    case "upcoming":
    default:
      return hubTokens.subtle;
  }
}

export default function HubPipelineStepper({
  steps,
  accent,
  softAccent,
  lineActiveColor,
  trailing,
}: HubPipelineStepperProps) {
  return (
    <Box sx={{ width: "100%", minWidth: 0 }}>
      <Stepper
        alternativeLabel
        // `nonLinear` + activeStep=-1 means MUI does NOT auto-derive step state
        // from an active index — our explicit per-step active/completed props
        // (which also drive the connector colour) are used verbatim.
        nonLinear
        activeStep={-1}
        connector={<HubConnector />}
        sx={{
          width: "100%",
          padding: 0,
          // CSS vars consumed by the connector — keeps the styled component static.
          "--hub-line-done": hubTokens.text,
          "--hub-line-active": lineActiveColor ?? hubTokens.text,
          "& .MuiStep-root": { paddingLeft: 0, paddingRight: 0 },
          "& .MuiStepLabel-root": { padding: 0 },
          "& .MuiStepLabel-iconContainer": { padding: 0 },
          "& .MuiStepLabel-alternativeLabel.MuiStepLabel-label": {
            marginTop: "6px",
          },
        }}
      >
        {steps.map((s) => {
          const completed = s.state === "done" || s.state === "success";
          const active = s.state === "current";
          return (
            <Step
              key={s.key}
              completed={completed}
              active={active}
              sx={{ flex: 1, minWidth: 0 }}
            >
              <StepLabel
                slots={{ stepIcon: HubStepIcon }}
                slotProps={{
                  stepIcon: {
                    hubState: s.state,
                    accent,
                    softAccent,
                    progress: s.progress,
                  } as HubStepIconSlotProps,
                }}
                optional={
                  s.caption ? (
                    <Box
                      component="span"
                      sx={{
                        display: "block",
                        textAlign: "center",
                        fontSize: 9.5,
                        lineHeight: 1.1,
                        fontFamily: hubTokens.mono,
                        fontWeight: 600,
                        color:
                          s.state === "current"
                            ? accent
                            : s.state === "success"
                              ? hubTokens.success
                              : hubTokens.muted,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.caption}
                    </Box>
                  ) : undefined
                }
              >
                <Box
                  component="span"
                  sx={{
                    fontSize: 10,
                    fontWeight: active || s.state === "success" ? 700 : 600,
                    letterSpacing: "0.3px",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                    color: labelColor(s.state, accent),
                  }}
                >
                  {s.label}
                </Box>
              </StepLabel>
            </Step>
          );
        })}
      </Stepper>
      {trailing != null && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "flex-start",
            marginTop: "4px",
          }}
        >
          {trailing}
        </Box>
      )}
    </Box>
  );
}
