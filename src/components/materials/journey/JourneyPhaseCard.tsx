"use client";

import React from "react";
import {
  Box,
  Paper,
  Typography,
  Button,
  Divider,
  alpha,
  useTheme,
} from "@mui/material";
import type { Theme } from "@mui/material/styles";
import Link from "next/link";
import type { JourneyPhaseStatus } from "@/types/journey.types";

export interface PhaseCardField {
  label: string;
  value: string;
  variant?: "default" | "amount" | "green" | "red" | "blue" | "muted" | "mono";
}

export interface PhaseCardAction {
  label: string;
  href: string;
  variant?: "primary" | "secondary" | "warn";
}

export interface JourneyPhaseCardProps {
  status: JourneyPhaseStatus;
  title: string;
  icon: string;
  statusLabel: string;
  fields: PhaseCardField[];
  actions: PhaseCardAction[];
  children?: React.ReactNode;
}

const STATUS_BORDER: Record<JourneyPhaseStatus, string> = {
  done: "#2e7d32",
  active: "#1565c0",
  pending: "#9e9e9e",
  blocked: "#c62828",
};

const STATUS_BG: Record<JourneyPhaseStatus, string> = {
  done: "#f1f8e9",
  active: "#e3f2fd",
  pending: "#fafafa",
  blocked: "#ffebee",
};

const STATUS_ICON_BG: Record<JourneyPhaseStatus, string> = {
  done: "#2e7d32",
  active: "#1565c0",
  pending: "#9e9e9e",
  blocked: "#c62828",
};

function fieldValueColor(
  variant: PhaseCardField["variant"],
  theme: Theme
): string {
  switch (variant) {
    case "amount":
      return theme.palette.warning.dark;
    case "green":
      return theme.palette.success.main;
    case "red":
      return theme.palette.error.main;
    case "blue":
      return theme.palette.primary.main;
    case "muted":
      return theme.palette.text.disabled;
    default:
      return theme.palette.text.primary;
  }
}

export function JourneyPhaseCard({
  status,
  title,
  icon,
  statusLabel,
  fields,
  actions,
  children,
}: JourneyPhaseCardProps) {
  const theme = useTheme();

  return (
    <Paper
      variant="outlined"
      sx={{
        borderLeft: `4px solid ${STATUS_BORDER[status]}`,
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: STATUS_BG[status],
      }}
    >
      {/* Header row */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1.25,
          borderBottom: `1px solid ${alpha(STATUS_BORDER[status], 0.15)}`,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              bgcolor: STATUS_ICON_BG[status],
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.85rem",
            }}
          >
            <span role="img" aria-hidden>
              {icon}
            </span>
          </Box>
          <Typography variant="subtitle2" fontWeight={700} sx={{ fontSize: "0.85rem" }}>
            {title}
          </Typography>
        </Box>
        <Typography
          variant="caption"
          sx={{
            fontSize: "0.7rem",
            color:
              status === "done"
                ? "success.dark"
                : status === "blocked"
                ? "error.main"
                : status === "active"
                ? "primary.main"
                : "text.secondary",
            fontWeight: 600,
          }}
        >
          {statusLabel}
        </Typography>
      </Box>

      {/* Fields grid */}
      {fields.length > 0 && (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 0,
            px: 2,
            py: 1.25,
          }}
        >
          {fields.map((f, i) => (
            <Box
              key={i}
              sx={{
                py: 0.5,
                borderBottom:
                  i < fields.length - 2
                    ? `1px dashed ${alpha(theme.palette.divider, 0.5)}`
                    : "none",
                pr: i % 2 === 0 ? 1 : 0,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontSize: "0.65rem",
                  color: "text.secondary",
                  display: "block",
                  textTransform: "uppercase",
                  letterSpacing: "0.02em",
                }}
              >
                {f.label}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  color: fieldValueColor(f.variant, theme),
                  fontFamily: f.variant === "mono" ? "monospace" : undefined,
                  wordBreak: "break-word",
                }}
              >
                {f.value}
              </Typography>
            </Box>
          ))}
        </Box>
      )}

      {/* Custom children (e.g. GROUP STOCK chip) */}
      {children && (
        <Box sx={{ px: 2, pb: 1 }}>
          {children}
        </Box>
      )}

      {/* Actions */}
      {actions.length > 0 && (
        <>
          <Divider />
          <Box
            sx={{
              display: "flex",
              gap: 1,
              px: 2,
              py: 1,
              flexWrap: "wrap",
            }}
          >
            {actions.map((action, i) => (
              <Button
                key={i}
                component={Link}
                href={action.href}
                size="small"
                variant={action.variant === "primary" ? "contained" : "outlined"}
                color={
                  action.variant === "warn"
                    ? "warning"
                    : action.variant === "primary"
                    ? "primary"
                    : "primary"
                }
                sx={{ fontSize: "0.75rem", py: 0.375, textTransform: "none" }}
              >
                {action.label}
              </Button>
            ))}
          </Box>
        </>
      )}
    </Paper>
  );
}

export default JourneyPhaseCard;
