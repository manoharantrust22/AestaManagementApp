"use client";

import { Box, Button, alpha } from "@mui/material";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";

/**
 * Calm Material 3 error banner with a prominent Retry action.
 *
 * Replaces the screaming red MUI <Alert severity="error"> for the specific
 * case of a recoverable mutation failure — most importantly, save timeouts.
 * The user's form data is intact; they just need one tap to retry. The
 * banner reads as "here's what happened, here's the recovery", not "your
 * data is broken".
 *
 * Use this for: save timeouts, network errors, transient API failures.
 * Use the standard <Alert> for: validation errors, permanent server errors
 * (404, 403), or anything the user can't recover from by retrying.
 */
export interface InlineErrorBannerProps {
  title: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  onDismiss?: () => void;
}

const M3_EASING = "cubic-bezier(0.2, 0, 0, 1)";

export function InlineErrorBanner({
  title,
  description,
  onRetry,
  retryLabel = "Retry",
  onDismiss,
}: InlineErrorBannerProps) {
  return (
    <Box
      role="alert"
      sx={(theme) => ({
        display: "flex",
        alignItems: "flex-start",
        gap: 1.5,
        px: 2,
        py: 1.5,
        borderRadius: 2,
        // Material 3 error-container tint: soft red surface, dark red ink.
        // Much calmer than the filled red of a snackbar, but still clearly
        // an error.
        bgcolor: alpha(theme.palette.error.main, theme.palette.mode === "dark" ? 0.18 : 0.08),
        border: 1,
        borderColor: alpha(theme.palette.error.main, 0.32),
        color:
          theme.palette.mode === "dark"
            ? theme.palette.error.light
            : theme.palette.error.dark,
        animation: `inline-error-in 280ms ${M3_EASING} both`,
        "@keyframes inline-error-in": {
          from: { opacity: 0, transform: "translateY(-4px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
      })}
    >
      <ErrorOutlineRoundedIcon sx={{ fontSize: 22, mt: 0.25, flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontSize: "0.85rem", fontWeight: 600, lineHeight: 1.4 }}>
          {title}
        </Box>
        {description && (
          <Box
            sx={(theme) => ({
              fontSize: "0.78rem",
              lineHeight: 1.45,
              mt: 0.25,
              // Slightly subdued — body sits below the title hierarchically.
              color:
                theme.palette.mode === "dark"
                  ? alpha(theme.palette.error.light, 0.85)
                  : alpha(theme.palette.error.dark, 0.85),
            })}
          >
            {description}
          </Box>
        )}
      </Box>
      {onRetry && (
        <Button
          size="small"
          onClick={onRetry}
          startIcon={<RefreshRoundedIcon sx={{ fontSize: 16 }} />}
          sx={(theme) => ({
            textTransform: "none",
            fontWeight: 600,
            borderRadius: 999,
            paddingInline: 1.5,
            height: 32,
            flexShrink: 0,
            color: "inherit",
            "&:hover": {
              bgcolor: alpha(theme.palette.error.main, 0.12),
            },
          })}
        >
          {retryLabel}
        </Button>
      )}
      {onDismiss && (
        <Button
          aria-label="Dismiss"
          size="small"
          onClick={onDismiss}
          sx={(theme) => ({
            minWidth: 32,
            width: 32,
            height: 32,
            borderRadius: 999,
            color: "inherit",
            flexShrink: 0,
            "&:hover": {
              bgcolor: alpha(theme.palette.error.main, 0.12),
            },
          })}
        >
          <CloseRoundedIcon sx={{ fontSize: 18 }} />
        </Button>
      )}
    </Box>
  );
}
