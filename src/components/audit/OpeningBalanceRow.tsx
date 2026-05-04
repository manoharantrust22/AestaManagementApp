"use client";

import React, { useState } from "react";
import {
  Box,
  Collapse,
  IconButton,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  PushPinOutlined,
} from "@mui/icons-material";
import type { OpeningBalance } from "@/hooks/queries/useOpeningBalances";

interface OpeningBalanceRowProps {
  cutoffDate: string;
  balances: OpeningBalance[];
}

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Non-allocatable display row rendered above the first live week of the
 * contract waterfall when the site is in 'reconciled' state AND has
 * laborer_opening_balances rows. Shows the per-laborer carry-forward from
 * a Mode B reconcile. Future contract payments do NOT fill these — they
 * are a permanent informational record of "what was owed before the app".
 */
export default function OpeningBalanceRow({
  cutoffDate,
  balances,
}: OpeningBalanceRowProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  if (balances.length === 0) return null;

  const totalOwed = balances.reduce((s, b) => s + b.openingWagesOwed, 0);
  const totalPaid = balances.reduce((s, b) => s + b.openingPaid, 0);
  const tone = {
    fg: theme.palette.info.dark,
    bg: alpha(theme.palette.info.main, 0.08),
    border: alpha(theme.palette.info.main, 0.3),
  };

  return (
    <Box
      sx={{
        mb: 1,
        bgcolor: "background.paper",
        border: `1px solid ${tone.border}`,
        borderRadius: 1.5,
        overflow: "hidden",
      }}
    >
      <Box
        component="button"
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse opening balance" : "Expand opening balance"}
        sx={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          py: 0.875,
          bgcolor: tone.bg,
          border: 0,
          cursor: "pointer",
          textAlign: "left",
          font: "inherit",
        }}
      >
        <PushPinOutlined sx={{ fontSize: 16, color: tone.fg }} />
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            color: tone.fg,
            flexShrink: 0,
          }}
        >
          Opening balance
        </Typography>
        <Typography sx={{ fontSize: 12, color: "text.secondary", flexShrink: 0 }}>
          as of {formatDate(cutoffDate)}
        </Typography>
        <Box
          sx={{
            flex: 1,
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 1.5,
            fontSize: 12,
            color: "text.secondary",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span>{balances.length} {balances.length === 1 ? "laborer" : "laborers"}</span>
          <span aria-hidden>·</span>
          <span>{formatINR(totalOwed)} owed</span>
          <span aria-hidden>·</span>
          <span>{formatINR(totalPaid)} paid</span>
        </Box>
        <IconButton
          size="small"
          component="span"
          tabIndex={-1}
          sx={{ p: 0.25, color: "text.secondary", flexShrink: 0 }}
        >
          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Box>

      <Collapse in={expanded} unmountOnExit>
        <Box sx={{ borderTop: `1px solid ${tone.border}`, bgcolor: alpha(theme.palette.info.main, 0.02) }}>
          {balances.map((b) => (
            <Box
              key={b.id}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 1.5,
                py: 0.75,
                borderBottom: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
                "&:last-of-type": { borderBottom: 0 },
                fontSize: 13,
              }}
            >
              <Box sx={{ flex: 1, fontWeight: 600 }}>{b.laborerName}</Box>
              <Box
                sx={{
                  display: "flex",
                  gap: 1.5,
                  alignItems: "center",
                  fontVariantNumeric: "tabular-nums",
                  color: "text.secondary",
                }}
              >
                <span>owed: <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>{formatINR(b.openingWagesOwed)}</Box></span>
                <span aria-hidden>·</span>
                <span>paid: <Box component="span" sx={{ fontWeight: 700, color: "text.primary" }}>{formatINR(b.openingPaid)}</Box></span>
              </Box>
            </Box>
          ))}
          <Box
            sx={{
              px: 1.5,
              py: 0.75,
              fontSize: 11,
              color: "text.secondary",
              fontStyle: "italic",
              borderTop: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
            }}
          >
            Non-allocatable. Future mesthri payments do not fill these — they are a frozen
            record of pre-app balances. To re-open the audit, run
            reopen_audit_after_opening_balance_reconcile via SQL.
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}
