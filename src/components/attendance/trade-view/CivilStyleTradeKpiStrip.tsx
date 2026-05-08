"use client";

import React from "react";
import {
  Box,
  Paper,
  Typography,
  Divider,
  Chip,
  Collapse,
  IconButton,
} from "@mui/material";
import { ExpandMore, ExpandLess } from "@mui/icons-material";
import type { TradeAttendanceSummary } from "@/hooks/queries/useTradeAttendanceSummary";
import type { TradeColor } from "@/theme/tradeColors";

interface CivilStyleTradeKpiStripProps {
  summary: TradeAttendanceSummary | undefined;
  tradeColor: TradeColor;
  isLoading?: boolean;
}

/**
 * Renders the trade summary using Civil's 9-tile KPI layout
 * (Period Total / Salary / Tea Shop / Daily / Contract / Market / Paid / Pending / Avg/Day).
 *
 * Data mapping (headcount mode):
 *   Salary       = laborDoneHeadcount
 *   Tea Shop     = amountPaidBreakdown.extras   (misc_expenses on this contract)
 *   Period Total = Salary + Tea Shop
 *   Daily        = 0     (headcount has no daily-wage workers)
 *   Contract     = laborDoneHeadcount  (all headcount labor is contract)
 *   Market       = 0     (headcount has no market labor)
 *   Paid         = payments + settlements (excludes extras — those are expenses)
 *   Pending      = max(0, Salary − Paid)
 *   Avg/Day      = Salary / daysHeadcountEntered
 */
export function CivilStyleTradeKpiStrip({
  summary,
  tradeColor,
  isLoading,
}: CivilStyleTradeKpiStripProps) {
  const [expanded, setExpanded] = React.useState(false);

  if (isLoading || !summary) {
    return (
      <Paper sx={{ overflow: "hidden", mb: { xs: 1, sm: 2 }, flexShrink: 0 }}>
        <Box sx={{ p: { xs: 0.75, sm: 2 } }}>
          <Typography variant="caption" color="text.secondary">
            Loading summary…
          </Typography>
        </Box>
      </Paper>
    );
  }

  const salary = summary.laborDoneHeadcount;
  const teaShop = summary.amountPaidBreakdown.extras;
  const periodTotal = salary + teaShop;
  const paid =
    summary.amountPaidBreakdown.payments +
    summary.amountPaidBreakdown.settlements;
  const pending = Math.max(0, salary - paid);
  const avgPerDay =
    summary.daysHeadcountEntered > 0
      ? salary / summary.daysHeadcountEntered
      : 0;
  const paidCount = summary.daysPaymentsRecorded;

  return (
    <Paper sx={{ overflow: "hidden", mb: { xs: 1, sm: 2 }, flexShrink: 0 }}>
      <Box sx={{ p: { xs: 0.75, sm: 2 } }}>
        {/* Mobile: Collapsible */}
        <Box sx={{ display: { xs: "block", sm: "none" } }}>
          <Box
            onClick={() => setExpanded(!expanded)}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              py: 0.5,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: "0.65rem" }}
              >
                Total
              </Typography>
              <Typography
                sx={{
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: tradeColor.main,
                }}
              >
                ₹{periodTotal.toLocaleString()}
              </Typography>
              <Chip
                label={`Paid: ₹${paid.toLocaleString()}`}
                size="small"
                color="success"
                sx={{ height: 18, fontSize: "0.55rem" }}
              />
              <Chip
                label={`Pending: ₹${pending.toLocaleString()}`}
                size="small"
                color="warning"
                sx={{ height: 18, fontSize: "0.55rem" }}
              />
            </Box>
            <IconButton size="small" sx={{ p: 0.25 }}>
              {expanded ? (
                <ExpandLess fontSize="small" />
              ) : (
                <ExpandMore fontSize="small" />
              )}
            </IconButton>
          </Box>
          <Collapse in={expanded}>
            <Box sx={{ pt: 1, borderTop: "1px solid", borderColor: "divider" }}>
              {/* Row 1: Salary, Tea Shop */}
              <Box sx={{ display: "flex", alignItems: "stretch", mb: 1 }}>
                <MobileTile label="Salary" value={salary} color="success.main" />
                <MobileTile label="Tea Shop" value={teaShop} color="secondary.main" />
              </Box>
              <Divider sx={{ my: 0.5 }} />
              {/* Row 2: Daily, Contract, Market */}
              <Box sx={{ display: "flex", alignItems: "stretch", mb: 1 }}>
                <MobileTile label="Daily" value={0} color="warning.main" />
                <MobileTile label="Contract" value={salary} color="info.main" />
                <MobileTile label="Market" value={0} color="secondary.main" />
              </Box>
              <Divider sx={{ my: 0.5 }} />
              {/* Row 3: Avg/Day */}
              <Box sx={{ display: "flex", alignItems: "stretch" }}>
                <MobileTile label="Avg/Day" value={Math.round(avgPerDay)} />
              </Box>
            </Box>
          </Collapse>
        </Box>

        {/* Desktop: Always expanded with vertical separators */}
        <Box
          sx={{
            display: { xs: "none", sm: "flex" },
            alignItems: "stretch",
            gap: 2,
          }}
        >
          {/* Group 1: Period Total, Salary, Tea Shop */}
          <Box sx={{ display: "flex", flex: 1, gap: 2 }}>
            <DesktopTile
              label="Period Total"
              value={periodTotal}
              valueSx={{
                fontSize: "1.25rem",
                fontWeight: 700,
                color: tradeColor.main,
              }}
            />
            <DesktopTile
              label="Salary"
              value={salary}
              valueSx={{
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "success.main",
              }}
            />
            <DesktopTile
              label="Tea Shop"
              value={teaShop}
              valueSx={{
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "secondary.main",
              }}
            />
          </Box>

          <Divider orientation="vertical" flexItem />

          {/* Group 2: Daily, Contract, Market */}
          <Box sx={{ display: "flex", flex: 1, gap: 2 }}>
            <DesktopTile
              label="Daily"
              value={0}
              valueSx={{
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "warning.main",
              }}
            />
            <DesktopTile
              label="Contract"
              value={salary}
              valueSx={{
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "info.main",
              }}
            />
            <DesktopTile
              label="Market"
              value={0}
              valueSx={{
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "secondary.main",
              }}
            />
          </Box>

          <Divider orientation="vertical" flexItem />

          {/* Group 3: Paid, Pending, Avg/Day */}
          <Box sx={{ display: "flex", flex: 1, gap: 2 }}>
            <Box sx={{ flex: 1, textAlign: "center" }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: "0.75rem" }}
              >
                Paid
              </Typography>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 0.5,
                }}
              >
                <Typography
                  sx={{
                    fontSize: "1.125rem",
                    fontWeight: 600,
                    color: "success.main",
                  }}
                >
                  ₹{paid.toLocaleString()}
                </Typography>
                {paidCount > 0 && (
                  <Chip
                    label={paidCount}
                    size="small"
                    color="success"
                    variant="outlined"
                    sx={{
                      height: 24,
                      "& .MuiChip-label": { px: 0.5, fontSize: "0.75rem" },
                    }}
                  />
                )}
              </Box>
            </Box>
            <Box sx={{ flex: 1, textAlign: "center" }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: "0.75rem" }}
              >
                Pending
              </Typography>
              <Typography
                sx={{
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  color: "warning.main",
                }}
              >
                ₹{pending.toLocaleString()}
              </Typography>
            </Box>
            <DesktopTile
              label="Avg/Day"
              value={Math.round(avgPerDay)}
              valueSx={{ fontSize: "1.125rem", fontWeight: 600 }}
            />
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}

function DesktopTile({
  label,
  value,
  valueSx,
}: {
  label: string;
  value: number;
  valueSx: object;
}) {
  return (
    <Box sx={{ flex: 1, textAlign: "center" }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontSize: "0.75rem" }}
      >
        {label}
      </Typography>
      <Typography sx={valueSx}>₹{value.toLocaleString()}</Typography>
    </Box>
  );
}

function MobileTile({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <Box sx={{ flex: 1, textAlign: "center" }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontSize: "0.6rem" }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: "0.8rem",
          fontWeight: 600,
          color: color ?? "text.primary",
        }}
      >
        ₹{value.toLocaleString()}
      </Typography>
    </Box>
  );
}
