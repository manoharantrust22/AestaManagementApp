"use client";

import React from "react";
import { Box, Typography, Stack, Tooltip } from "@mui/material";
import {
  CheckCircle as OnTrackIcon,
  Warning as AmberIcon,
  ErrorOutline as RedIcon,
} from "@mui/icons-material";
import type {
  ContractReconciliation,
  LaborTrackingMode,
} from "@/types/trade.types";

interface ReconciliationStripProps {
  reconciliation: ContractReconciliation | undefined;
  laborTrackingMode: LaborTrackingMode;
  /** Live total quoted (falls back to reconciliation.quotedAmount). */
  fallbackQuoted?: number;
}

function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

export function ReconciliationStrip({
  reconciliation,
  laborTrackingMode,
  fallbackQuoted = 0,
}: ReconciliationStripProps) {
  const quoted = reconciliation?.quotedAmount ?? fallbackQuoted;
  const paid = reconciliation?.amountPaid ?? 0;
  // For mesthri-only contracts, "labor done" isn't tracked, so the variance
  // basis is paid vs quoted. For detailed/headcount, use implied labor value
  // (paid vs labor done) — that's the more useful "is the mesthri paid ahead
  // for the work he's actually completed?" question.
  const laborDone =
    laborTrackingMode === "detailed"
      ? reconciliation?.impliedLaborValueDetailed ?? 0
      : laborTrackingMode === "headcount"
      ? reconciliation?.impliedLaborValueHeadcount ?? 0
      : 0;

  const useLabor = laborTrackingMode !== "mesthri_only" && laborDone > 0;
  const basis = useLabor ? laborDone : quoted;
  const basisLabel = useLabor ? "Labor done" : "Quoted";
  const variance = basis > 0 ? paid - basis : 0;
  const variancePct = basis > 0 ? Math.round((variance / basis) * 100) : 0;

  let level: "ok" | "amber" | "red" = "ok";
  if (variance > 0 && Math.abs(variancePct) > 20) level = "red";
  else if (variance > 0 && variance > 0) level = "amber";

  const colors = {
    ok: { bg: "success.50" as any, fg: "success.main", icon: <OnTrackIcon fontSize="small" /> },
    amber: { bg: "warning.50" as any, fg: "warning.dark", icon: <AmberIcon fontSize="small" /> },
    red: { bg: "error.50" as any, fg: "error.main", icon: <RedIcon fontSize="small" /> },
  }[level];

  const message =
    basis === 0
      ? `${formatINR(paid)} paid · no ${basisLabel.toLowerCase()} reference yet`
      : variance === 0
      ? `On track · paid matches ${basisLabel.toLowerCase()}`
      : variance > 0
      ? `Paid ahead by ₹${formatINR(variance)} (${Math.abs(variancePct)}% over ${basisLabel.toLowerCase()})`
      : `Paid behind by ₹${formatINR(-variance)} (${Math.abs(variancePct)}% under ${basisLabel.toLowerCase()})`;

  const tooltip =
    laborTrackingMode === "mesthri_only"
      ? "Variance compares paid vs the quoted lump sum. Headcount/detailed contracts compare paid vs labor done (more accurate)."
      : `Variance compares paid (₹${formatINR(paid)}) vs ${basisLabel.toLowerCase()} (₹${formatINR(basis)}).`;

  return (
    <Tooltip title={tooltip} placement="top" arrow>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.25,
          py: 0.75,
          borderRadius: 1,
          bgcolor: (theme) =>
            level === "ok"
              ? theme.palette.mode === "light"
                ? "#e8f5e9"
                : "rgba(76, 175, 80, 0.12)"
              : level === "amber"
              ? theme.palette.mode === "light"
                ? "#fff3e0"
                : "rgba(255, 152, 0, 0.14)"
              : theme.palette.mode === "light"
              ? "#ffebee"
              : "rgba(244, 67, 54, 0.14)",
          color: colors.fg,
          border: "1px solid",
          borderColor: colors.fg,
          opacity: 0.95,
        }}
      >
        {colors.icon}
        <Stack direction="row" spacing={1.5} alignItems="baseline" sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" component="div" sx={{ fontWeight: 600, color: colors.fg }}>
            {message}
          </Typography>
        </Stack>
      </Box>
    </Tooltip>
  );
}
