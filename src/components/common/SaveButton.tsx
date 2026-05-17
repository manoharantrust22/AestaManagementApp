"use client";

import { useEffect, useState } from "react";
import { Box, Button, ButtonProps, CircularProgress, alpha } from "@mui/material";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";

/**
 * SaveButton — Material 3 styled save action with rich state machine.
 *
 * One button, five visual states driven by props:
 *   idle    → "Save changes"
 *   saving  → spinner + "Saving…" (default)
 *   slow    → spinner + "Still saving…" + helper text below (>= slowAfterMs)
 *   error   → red, "Try again" with refresh icon (after onClick mutation rejected)
 *   success → green flash with checkmark, ~700ms before parent dismisses
 *
 * The component does NOT own the mutation — the parent passes `isSaving`,
 * `isError`, `isSuccess` and an `onClick`. The only piece of state owned
 * locally is the elapsed-time tracking that drives the "slow" mode, because
 * that's purely a presentation concern (parent shouldn't care).
 *
 * Why this exists: the previous Save button was a one-state "Saving…" label
 * that gave the user no feedback when network was slow — they had no way to
 * tell the difference between "almost done" and "stalled forever". The new
 * button shows progress signals AND offers a clear retry on failure, with
 * the form's data preserved (parent keeps the dialog open).
 */
export interface SaveButtonProps
  extends Omit<ButtonProps, "onClick" | "type" | "children"> {
  isSaving: boolean;
  isError?: boolean;
  isSuccess?: boolean;
  /** Label in idle state. Falls back to "Save changes". */
  idleLabel?: string;
  /** Label in saving state. Falls back to "Saving…". */
  savingLabel?: string;
  /** Label after slowAfterMs elapsed. Falls back to "Still saving…". */
  slowLabel?: string;
  /** Label in error state. Falls back to "Try again". */
  errorLabel?: string;
  /** Label in success state. Falls back to "Saved". */
  successLabel?: string;
  /** Helper text shown under button when slowMode is active. */
  slowHelperText?: string;
  /** Milliseconds after which slow-mode activates. Default 8000. */
  slowAfterMs?: number;
  onClick: () => void;
}

// Material 3 emphasized easing curve. The state morphs all use this so the
// motion feels intentional and consistent across the whole UI.
const M3_EASING = "cubic-bezier(0.2, 0, 0, 1)";

export function SaveButton({
  isSaving,
  isError = false,
  isSuccess = false,
  idleLabel = "Save changes",
  savingLabel = "Saving…",
  slowLabel = "Still saving…",
  errorLabel = "Try again",
  successLabel = "Saved",
  slowHelperText = "Your network is slow — hang on",
  slowAfterMs = 8000,
  onClick,
  disabled,
  sx,
  ...rest
}: SaveButtonProps) {
  const [slowMode, setSlowMode] = useState(false);

  // Elapsed-time tracking. Reset whenever a fresh save starts.
  useEffect(() => {
    if (!isSaving) {
      setSlowMode(false);
      return;
    }
    const timer = window.setTimeout(() => setSlowMode(true), slowAfterMs);
    return () => window.clearTimeout(timer);
  }, [isSaving, slowAfterMs]);

  // Resolve current visual state. Priority: success > error > saving > idle.
  const state: "idle" | "saving" | "slow" | "error" | "success" = isSuccess
    ? "success"
    : isError && !isSaving
      ? "error"
      : isSaving
        ? slowMode
          ? "slow"
          : "saving"
        : "idle";

  const isBusy = state === "saving" || state === "slow";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5 }}>
      <Button
        variant="contained"
        disableElevation
        onClick={onClick}
        disabled={disabled || isBusy || state === "success"}
        startIcon={
          state === "success" ? (
            <CheckRoundedIcon sx={{ fontSize: 18 }} />
          ) : state === "error" ? (
            <RefreshRoundedIcon sx={{ fontSize: 18 }} />
          ) : isBusy ? (
            <CircularProgress
              size={16}
              thickness={5}
              sx={{ color: "rgba(255,255,255,0.85)" }}
            />
          ) : null
        }
        sx={[
          (theme) => ({
            textTransform: "none",
            fontWeight: 600,
            letterSpacing: 0.1,
            minWidth: 160,
            height: 40,
            borderRadius: 999, // Material 3 expressive button
            paddingInline: 2.5,
            transition: `background-color 200ms ${M3_EASING}, color 200ms ${M3_EASING}, transform 120ms ${M3_EASING}`,
            ...(state === "success" && {
              bgcolor: theme.palette.success.main,
              color: theme.palette.success.contrastText,
              "&:hover": { bgcolor: theme.palette.success.main },
              "&.Mui-disabled": {
                bgcolor: theme.palette.success.main,
                color: theme.palette.success.contrastText,
                opacity: 1,
              },
            }),
            ...(state === "error" && {
              bgcolor: theme.palette.error.main,
              color: theme.palette.error.contrastText,
              "&:hover": { bgcolor: theme.palette.error.dark },
              // Subtle horizontal shake on entering error state, drawing the eye
              // without being playful — the bug is real and the affordance must
              // read as "something needs your attention".
              animation: `save-error-nudge 380ms ${M3_EASING} both`,
              "@keyframes save-error-nudge": {
                "0%": { transform: "translateX(0)" },
                "20%": { transform: "translateX(-4px)" },
                "40%": { transform: "translateX(4px)" },
                "60%": { transform: "translateX(-2px)" },
                "80%": { transform: "translateX(2px)" },
                "100%": { transform: "translateX(0)" },
              },
            }),
            ...(isBusy && {
              // Slightly muted, so it reads as "in progress, not interactive".
              bgcolor: alpha(theme.palette.primary.main, 0.85),
              "&.Mui-disabled": {
                bgcolor: alpha(theme.palette.primary.main, 0.85),
                color: "rgba(255,255,255,0.95)",
              },
            }),
            // Press feedback — Material 3 spec uses a tiny scale-down on press.
            "&:active:not(.Mui-disabled)": { transform: "scale(0.97)" },
          }),
          ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
        ]}
        {...rest}
      >
        {state === "idle" && idleLabel}
        {state === "saving" && savingLabel}
        {state === "slow" && slowLabel}
        {state === "error" && errorLabel}
        {state === "success" && successLabel}
      </Button>
      {state === "slow" && (
        <Box
          aria-live="polite"
          sx={(theme) => ({
            fontSize: "0.7rem",
            color: theme.palette.text.secondary,
            // Match the button's right edge.
            textAlign: "right",
            maxWidth: 240,
            // Soft fade-in so it doesn't startle on appearance.
            animation: `slow-helper-in 240ms ${M3_EASING} both`,
            "@keyframes slow-helper-in": {
              from: { opacity: 0, transform: "translateY(-2px)" },
              to: { opacity: 1, transform: "translateY(0)" },
            },
          })}
        >
          {slowHelperText}
        </Box>
      )}
    </Box>
  );
}
