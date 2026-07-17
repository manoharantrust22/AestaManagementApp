"use client";

import React, { useMemo } from "react";
import { Box, Chip, Skeleton, Typography, useTheme, alpha } from "@mui/material";
import dayjs from "dayjs";
import type { WaterfallWeek } from "@/hooks/queries/useSalaryWaterfall";

interface SalaryWaterfallListProps {
  weeks: WaterfallWeek[];
  futureCredit: number;
  isLoading: boolean;
  onRowClick: (week: WaterfallWeek) => void;
  onSettleClick: (week: WaterfallWeek) => void;
  /** Crew-pay sites: excess money counts toward the mesthri, not future weeks. */
  crewMode?: boolean;
  mesthriName?: string | null;
}

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

function StatusChip({ status, paid, wagesDue }: {
  status: WaterfallWeek["status"]; paid: number; wagesDue: number;
}) {
  const theme = useTheme();
  if (status === "settled") {
    return <Chip size="small" label="✓ Settled"
                  sx={{ bgcolor: alpha(theme.palette.success.main, 0.18),
                        color: theme.palette.success.dark,
                        fontWeight: 700, letterSpacing: 0.4 }} />;
  }
  if (status === "underpaid") {
    const pct = wagesDue > 0 ? Math.round((1 - paid / wagesDue) * 100) : 0;
    return <Chip size="small" label={`⚠ Underpaid ${pct}%`}
                  sx={{ bgcolor: alpha(theme.palette.warning.main, 0.18),
                        color: theme.palette.warning.dark,
                        fontWeight: 700, letterSpacing: 0.4 }} />;
  }
  return <Chip size="small" label="Pending"
                sx={{ bgcolor: theme.palette.grey[100],
                      color: theme.palette.text.secondary,
                      fontWeight: 700, letterSpacing: 0.4 }} />;
}

export function SalaryWaterfallList({
  weeks, futureCredit, isLoading, onRowClick, onSettleClick, crewMode, mesthriName,
}: SalaryWaterfallListProps) {
  const theme = useTheme();

  // Display newest week first. The RPC's allocation algorithm runs oldest-first
  // (that's the waterfall semantic) — but the user reads weeks newest-down, so
  // reverse on the client only.
  const displayWeeks = useMemo(
    () => [...weeks].sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1)),
    [weeks]
  );

  if (isLoading) {
    return (
      <Box sx={{ p: 1.5 }}>
        {[0,1,2].map(i => (
          <Skeleton key={i} variant="rounded" height={64} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }

  if (weeks.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          No contract laborer attendance recorded for this period.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1, sm: 1.25 }, display: "flex", flexDirection: "column", gap: 1 }}>
        {displayWeeks.map((w) => (
          <Box
            key={w.weekStart}
            onClick={() => onRowClick(w)}
            sx={{
              px: { xs: 1.25, sm: 1.75 }, py: 1.25,
              cursor: "pointer",
              bgcolor: "background.paper",
              border: 1,
              borderColor: "divider",
              borderRadius: 1.5,
              transition: "box-shadow 120ms, border-color 120ms",
              "&:hover": {
                bgcolor: "action.hover",
                boxShadow: 1,
                borderColor: alpha(theme.palette.primary.main, 0.4),
              },
            }}
          >
            <Box sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr auto", md: "150px 1fr 1fr 1fr 130px" },
              gap: { xs: 1, md: 1.5 },
              alignItems: "center",
            }}>
              <Box sx={{ gridColumn: { xs: "1 / -1", md: "auto" } }}>
                <Typography sx={{ fontWeight: 700, fontSize: 13 }}>
                  {dayjs(w.weekStart).format("DD MMM")} – {dayjs(w.weekEnd).format("DD MMM")}
                </Typography>
                <Typography sx={{ fontSize: 10, color: "text.secondary",
                                   textTransform: "uppercase", letterSpacing: 0.3 }}>
                  {w.daysWorked} days · {w.laborerCount} lab.
                </Typography>
              </Box>

              <Box sx={{ display: { xs: "none", md: "block" } }}>
                <Typography sx={{ fontSize: 9.5, color: "text.secondary",
                                   textTransform: "uppercase", letterSpacing: 0.4 }}>Wages due</Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {formatINR(w.wagesDue)}
                </Typography>
              </Box>

              <Box sx={{ display: { xs: "none", md: "block" } }}>
                <Typography sx={{ fontSize: 9.5, color: "text.secondary",
                                   textTransform: "uppercase", letterSpacing: 0.4 }}>Paid</Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {formatINR(w.paid)}
                </Typography>
              </Box>

              <Box sx={{ display: { xs: "none", md: "block" } }}>
                <Box sx={{ height: 6, bgcolor: "divider", borderRadius: 0.5, overflow: "hidden" }}>
                  <Box sx={{
                    height: "100%",
                    width: `${w.wagesDue > 0 ? Math.min(100, (w.paid / w.wagesDue) * 100) : 0}%`,
                    bgcolor: w.status === "settled" ? "success.main"
                           : w.status === "underpaid" ? "warning.main"
                           : "grey.400",
                  }} />
                </Box>
              </Box>

              <Box sx={{ justifySelf: "end" }}>
                <StatusChip status={w.status} paid={w.paid} wagesDue={w.wagesDue} />
              </Box>

              {/* Mobile-only due/paid line */}
              <Box sx={{
                display: { xs: "flex", md: "none" },
                gridColumn: "1 / -1",
                justifyContent: "space-between",
                fontSize: 11.5, color: "text.secondary",
                fontVariantNumeric: "tabular-nums",
                mt: 0.25,
              }}>
                <span>Due: <b>{formatINR(w.wagesDue)}</b></span>
                <span>Paid: <b>{formatINR(w.paid)}</b></span>
              </Box>
            </Box>

            {/* "Filled by" sub-line */}
            {(w.filledBy.length > 0 || w.status === "underpaid") && (
              <Box sx={{
                mt: 0.75,
                pl: { xs: 0, md: "150px" },
                fontSize: 11.5, color: "text.secondary",
                lineHeight: 1.5,
              }}>
                {w.filledBy.length > 0 && (
                  <>Filled by{" "}
                    {w.filledBy.map((f, i) => (
                      <React.Fragment key={f.ref + i}>
                        <Box component="span" sx={{
                          fontFamily: "ui-monospace, monospace",
                          fontSize: 10.5, fontWeight: 600,
                          bgcolor: "background.paper",
                          border: 1, borderColor: "divider",
                          borderRadius: 0.5, px: 0.75, mx: 0.25,
                        }}>{f.ref}</Box>
                        {formatINR(f.amount)}
                        {/* Crew mode: say WHO the money reached, not just which receipt. */}
                        {f.laborerName ? (
                          <Box component="span" sx={{ fontWeight: 600 }}> → {f.laborerName}</Box>
                        ) : f.kind === "commission" ? (
                          <Box component="span" sx={{ fontWeight: 600 }}> → commission</Box>
                        ) : f.kind === "pool" && crewMode ? (
                          <Box component="span" sx={{ fontWeight: 600 }}> → mesthri</Box>
                        ) : null}
                        {i < w.filledBy.length - 1 ? " + " : ""}
                      </React.Fragment>
                    ))}
                  </>
                )}
                {w.status === "underpaid" && (
                  <>
                    {w.filledBy.length > 0 ? " · " : ""}
                    <Box component="span" sx={{ color: "warning.dark", fontWeight: 600 }}>
                      {formatINR(w.wagesDue - w.paid)} still owed
                    </Box>
                    <Box
                      component="span"
                      role="button"
                      onClick={(e) => { e.stopPropagation(); onSettleClick(w); }}
                      sx={{ color: "primary.main", fontWeight: 600, ml: 1, cursor: "pointer",
                            "&:hover": { textDecoration: "underline" } }}
                    >
                      [+ Add settlement to fill ▶]
                    </Box>
                  </>
                )}
              </Box>
            )}
          </Box>
        ))}

        {/* Synthetic Future Credit row (only when futureCredit > 0) */}
        {futureCredit > 0 && (
          <Box sx={{
            px: { xs: 1.25, sm: 1.75 }, py: 1.25,
            bgcolor: alpha(theme.palette.info.main, 0.05),
            border: `1px dashed ${theme.palette.info.main}`,
            borderRadius: 1.5,
          }}>
            <Box sx={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              gap: 1.5, flexWrap: "wrap",
            }}>
              <Typography sx={{ fontWeight: 700, color: "info.dark" }}>
                🟦 Future credit
              </Typography>
              <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "info.dark" }}>
                {formatINR(futureCredit)}
              </Typography>
              <Chip size="small" label="⬆ Excess paid" sx={{
                bgcolor: alpha(theme.palette.info.main, 0.18),
                color: theme.palette.info.dark, fontWeight: 700, letterSpacing: 0.4,
              }} />
            </Box>
            <Typography sx={{ fontSize: 11.5, color: "info.dark", mt: 0.5 }}>
              {crewMode
                ? `${formatINR(futureCredit)} paid in advance · counts toward ${mesthriName ?? "the mesthri"}'s own wages + commission as he works`
                : `${formatINR(futureCredit)} paid in advance · will absorb future weeks once worked`}
            </Typography>
          </Box>
        )}
    </Box>
  );
}
