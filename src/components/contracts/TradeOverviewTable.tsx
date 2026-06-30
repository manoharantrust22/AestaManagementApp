"use client";

import React from "react";
import {
  Box,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import type {
  OverviewRow,
  OverviewTotals,
  OverviewTier,
} from "@/lib/workforce/tradeOverview";
import { wsColors } from "@/lib/workforce/workspaceTokens";

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

const TIER_META: Record<OverviewTier, { label: string; color: string; bg: string }> = {
  no_contract: { label: "NO CONTRACT", color: wsColors.red, bg: wsColors.redBg },
  blind: { label: "₹0 agreed", color: wsColors.amber, bg: wsColors.amberBg },
  overpaid: { label: "Overpaid", color: wsColors.amber, bg: wsColors.amberBg },
  healthy: { label: "Healthy", color: wsColors.green, bg: wsColors.greenBg },
};

/**
 * Presentational cross-site overview table: one row per (site, trade), already
 * sorted attention-first by the caller, plus a totals strip. Clicking a row calls
 * onOpenRow (the parent switches the selected site + navigates).
 */
export function TradeOverviewTable({
  rows,
  totals,
  onOpenRow,
}: {
  rows: OverviewRow[];
  totals: OverviewTotals;
  onOpenRow: (row: OverviewRow) => void;
}) {
  if (rows.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ p: 2, fontStyle: "italic" }}>
        No trades with contracts across your sites yet.
      </Typography>
    );
  }
  return (
    <Box>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Site</TableCell>
            <TableCell>Trade</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Agreed</TableCell>
            <TableCell align="right">Spent</TableCell>
            <TableCell align="right">Remaining</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => {
            const meta = TIER_META[r.tier];
            return (
              <TableRow
                key={`${r.siteId}:${r.tradeCategoryId}`}
                hover
                sx={{ cursor: "pointer" }}
                onClick={() => onOpenRow(r)}
              >
                <TableCell>{r.siteName}</TableCell>
                <TableCell>{r.tradeName}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={meta.label}
                    sx={{ bgcolor: meta.bg, color: meta.color, fontWeight: 700 }}
                  />
                </TableCell>
                <TableCell align="right">{inr(r.agreed)}</TableCell>
                <TableCell align="right">{inr(r.spent)}</TableCell>
                <TableCell align="right" sx={{ color: r.tier === "overpaid" ? wsColors.red : undefined }}>
                  {r.tier === "overpaid" ? `-${inr(Math.abs(r.remaining))}` : inr(r.remaining)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Box
        sx={{
          display: "flex",
          gap: 3,
          flexWrap: "wrap",
          mt: 1.5,
          px: 1,
          py: 1,
          bgcolor: wsColors.canvas,
          borderRadius: 1,
        }}
      >
        <Typography sx={{ fontWeight: 700 }}>Agreed {inr(totals.agreed)}</Typography>
        <Typography sx={{ fontWeight: 700 }}>Spent {inr(totals.spent)}</Typography>
        <Typography sx={{ fontWeight: 700 }}>Remaining {inr(totals.remaining)}</Typography>
        <Typography sx={{ fontWeight: 700, color: totals.blindCount > 0 ? wsColors.amber : wsColors.green }}>
          {totals.blindCount} running blind
        </Typography>
      </Box>
    </Box>
  );
}
