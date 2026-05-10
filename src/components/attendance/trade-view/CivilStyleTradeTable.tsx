"use client";

import React, { useMemo, useState } from "react";
import {
  Box,
  Paper,
  Table,
  TableContainer,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Typography,
  IconButton,
  Stack,
  Chip,
  Tooltip,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  PhotoCamera as CameraIcon,
  CalendarMonth,
  TaskAlt as SettleIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import { weekStartOf, weekEndOf } from "@/lib/utils/weekUtils";
import { useContractHeadcount } from "@/hooks/queries/useContractHeadcount";
import { useContractMidEntries } from "@/hooks/queries/useContractMidEntries";
import { useQueryClient } from "@tanstack/react-query";
import { WeeklyHeadcountSettleDialog } from "@/components/trades/WeeklyHeadcountSettleDialog";
import type { TradeColor } from "@/theme/tradeColors";

interface CivilStyleTradeTableProps {
  siteId: string;
  contractId: string;
  contractTitle: string;
  tradeColor: TradeColor;
  /** Triggered when supervisor taps a date row to enter / view it. */
  onPickDate: (dateISO: string) => void;
  /**
   * Data source. 'headcount' = role units × rates (default). 'mid' = mid-mode
   * day entries (laborer roster + day_total_amount). The visual layout is
   * identical across modes so supervisors see one consistent shell.
   */
  mode?: "headcount" | "mid";
}

interface DayRow {
  date: string;
  totalUnits: number;
  impliedAmount: number;
  hasEntry: boolean;
  /** Mid-mode only: work-done days (e.g., 0.5, 1.0, 1.5). */
  workDone?: number;
  /** Mid-mode only: free-form note describing the day's work. */
  note?: string | null;
}

interface WeekGroup {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  isCurrentWeek: boolean;
  days: DayRow[];
  weekTotal: number;
}

function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

/**
 * Civil-shaped attendance table for non-civil trade contracts (headcount mode).
 *
 * Mirrors the 13-column Civil layout from /site/attendance:
 *   Date | Daily | Contract | Market | Total | In | Out | Salary | Tea Shop | Expense | Work | Actions
 *
 * Headcount semantics: Contract column = sum of per-role units that day,
 * Daily/Market = 0 always (headcount has no daily-wage or market labor).
 * In/Out times and per-day Tea Shop/Expense/Work breakdowns aren't tracked
 * for headcount entries → those cells show "—". Entry state ("Recorded" /
 * "Not entered") goes in the Actions column.
 */
export function CivilStyleTradeTable({
  siteId,
  contractId,
  contractTitle,
  tradeColor,
  onPickDate,
  mode = "headcount",
}: CivilStyleTradeTableProps) {
  const queryClient = useQueryClient();
  const headcountQuery = useContractHeadcount(
    mode === "headcount" ? contractId : undefined
  );
  const midQuery = useContractMidEntries(
    mode === "mid" ? contractId : undefined
  );
  const isLoading =
    mode === "headcount" ? headcountQuery.isLoading : midQuery.isLoading;
  const headcount = headcountQuery.data;
  const midEntries = midQuery.data;
  const [settleWeekStart, setSettleWeekStart] = useState<string | null>(null);

  const weeks: WeekGroup[] = useMemo(() => {
    if (mode === "headcount" && !headcount) return [];
    if (mode === "mid" && !midEntries) return [];
    const today = dayjs();
    const groups: WeekGroup[] = [];
    for (let weekOffset = 0; weekOffset < 4; weekOffset++) {
      const anchor = today.subtract(weekOffset, "week");
      const wsDay = weekStartOf(anchor);
      const weDay = weekEndOf(anchor);
      const ws = wsDay.format("YYYY-MM-DD");
      const we = weDay.format("YYYY-MM-DD");
      const isCurrent = wsDay.isSame(weekStartOf(today), "day");
      const weekLabel = `${wsDay.format("MMM D")} - ${weDay.format("MMM D, YYYY")}`;

      const days: DayRow[] = [];
      let weekTotal = 0;
      for (let d = 0; d < 7; d++) {
        const date = wsDay.add(d, "day").format("YYYY-MM-DD");
        let dayUnits = 0;
        let dayAmount = 0;
        let dayWorkDone: number | undefined;
        let dayNote: string | null | undefined;
        if (mode === "headcount" && headcount) {
          for (const e of headcount.recent) {
            if (e.attendanceDate === date) {
              dayUnits += e.units;
              const rate =
                headcount.rates.find((r) => r.roleId === e.roleId)?.dailyRate ??
                0;
              dayAmount += e.units * rate;
            }
          }
        } else if (mode === "mid" && midEntries) {
          const entry = midEntries.find((e) => e.attendanceDate === date);
          if (entry) {
            dayUnits = entry.laborerIds.length;
            dayAmount = entry.dayTotalAmount;
            dayWorkDone = entry.workDoneUnits;
            dayNote = entry.note;
          }
        }
        weekTotal += dayAmount;
        // A row counts as "recorded" if any of its mid-mode fields have
        // data — units, amount, work-done, or a note. Without this,
        // a notes-only row would render as if the day was untouched.
        const hasEntry =
          dayUnits > 0 ||
          dayAmount > 0 ||
          (dayWorkDone !== undefined && dayWorkDone > 0) ||
          (dayNote !== undefined && dayNote !== null && dayNote.length > 0);
        days.push({
          date,
          totalUnits: dayUnits,
          impliedAmount: dayAmount,
          hasEntry,
          workDone: dayWorkDone,
          note: dayNote,
        });
      }
      // Match Civil's DESC ordering within a week — latest date first so
      // today sits at the top of the current week and supervisors don't have
      // to scroll past Sunday-through-Friday to reach today's row.
      days.reverse();
      groups.push({
        weekStart: ws,
        weekEnd: we,
        weekLabel,
        isCurrentWeek: isCurrent,
        days,
        weekTotal,
      });
    }
    return groups;
  }, [mode, headcount, midEntries]);

  if (isLoading) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Loading attendance…
        </Typography>
      </Paper>
    );
  }

  if (mode === "headcount" && (!headcount || headcount.rates.length === 0)) {
    return (
      <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          No role rate card set for this contract. Open the contract on{" "}
          <strong>/site/trades</strong> to configure roles, then come back here.
        </Typography>
      </Paper>
    );
  }

  const headerCellSx = {
    bgcolor: tradeColor.dark,
    color: tradeColor.contrastText,
    fontWeight: 600,
    whiteSpace: "nowrap" as const,
  };

  return (
    <>
      <Paper sx={{ overflow: "hidden" }}>
        <TableContainer sx={{ maxHeight: { xs: "60vh", md: "70vh" } }}>
          <Table stickyHeader size="small" sx={{ minWidth: { xs: 600, sm: 800 } }}>
            <TableHead>
              <TableRow sx={{ bgcolor: tradeColor.dark }}>
                <TableCell sx={{ ...headerCellSx, minWidth: 110 }}>Date</TableCell>
                <TableCell sx={{ ...headerCellSx, textAlign: "center", minWidth: 60 }}>Daily</TableCell>
                <TableCell sx={{ ...headerCellSx, textAlign: "center", minWidth: 70 }}>Contract</TableCell>
                <TableCell sx={{ ...headerCellSx, textAlign: "center", minWidth: 60 }}>Market</TableCell>
                <TableCell sx={{ ...headerCellSx, textAlign: "center", minWidth: 60 }}>Total</TableCell>
                <TableCell sx={{ ...headerCellSx, textAlign: "center", minWidth: 60 }}>In</TableCell>
                <TableCell sx={{ ...headerCellSx, textAlign: "center", minWidth: 60 }}>Out</TableCell>
                <TableCell sx={{ ...headerCellSx, textAlign: "right", minWidth: 80 }}>Salary</TableCell>
                <TableCell sx={{ ...headerCellSx, textAlign: "right", minWidth: 80 }}>Tea Shop</TableCell>
                <TableCell sx={{ ...headerCellSx, textAlign: "right", minWidth: 80 }}>Expense</TableCell>
                <TableCell sx={{ ...headerCellSx, minWidth: 120 }}>Work</TableCell>
                <TableCell sx={{ ...headerCellSx, textAlign: "center", minWidth: 110 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {weeks.map((week) => (
                <React.Fragment key={week.weekStart}>
                  {/* Weekly separator strip — same visual rhythm as Civil */}
                  <TableRow
                    sx={{
                      bgcolor: week.isCurrentWeek ? "info.50" : "grey.100",
                      borderTop: 2,
                      borderBottom: 2,
                      borderColor: week.isCurrentWeek ? "info.main" : tradeColor.main,
                    }}
                  >
                    <TableCell colSpan={12} sx={{ py: 1.5, px: 2 }}>
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          flexWrap: "wrap",
                          gap: 2,
                        }}
                      >
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                          <CalendarMonth
                            sx={{
                              color: week.isCurrentWeek ? "info.main" : tradeColor.main,
                              fontSize: 24,
                            }}
                          />
                          <Box>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                              <Typography
                                variant="subtitle2"
                                fontWeight={700}
                                sx={{ color: week.isCurrentWeek ? "info.main" : tradeColor.main }}
                              >
                                {week.isCurrentWeek
                                  ? `This Week: ${week.weekLabel}`
                                  : `Week: ${week.weekLabel}`}
                              </Typography>
                              {week.isCurrentWeek && (
                                <Chip
                                  size="small"
                                  label="In Progress"
                                  color="info"
                                  sx={{ height: 20, fontSize: "0.65rem" }}
                                />
                              )}
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                              {week.days.filter((d) => d.hasEntry).length} work days entered
                            </Typography>
                          </Box>
                        </Box>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Chip
                            label={`Week labor: ₹${formatINR(week.weekTotal)}`}
                            size="small"
                            color={week.weekTotal > 0 ? "primary" : "default"}
                            variant="outlined"
                          />
                          {/* Weekly settle only wired for headcount mode today.
                              Mid-mode settle goes through RecordPaymentDialog
                              from the contract menu on /site/trades. */}
                          {mode === "headcount" &&
                            !week.isCurrentWeek &&
                            week.weekTotal > 0 && (
                              <Chip
                                icon={<SettleIcon sx={{ fontSize: 16 }} />}
                                label={`Settle ₹${formatINR(week.weekTotal)}`}
                                size="small"
                                color="success"
                                onClick={() => setSettleWeekStart(week.weekStart)}
                                sx={{ cursor: "pointer" }}
                              />
                            )}
                        </Stack>
                      </Box>
                    </TableCell>
                  </TableRow>

                  {/* Daily rows — Civil column shape */}
                  {week.days.map((day) => {
                    const dayJs = dayjs(day.date);
                    const isToday = dayJs.isSame(dayjs(), "day");
                    const isFuture = dayJs.isAfter(dayjs(), "day");
                    const isSunday = dayJs.day() === 0;
                    return (
                      <TableRow
                        key={day.date}
                        hover
                        sx={{
                          opacity: isFuture ? 0.45 : 1,
                          bgcolor: isToday
                            ? (theme) =>
                                theme.palette.mode === "light"
                                  ? "warning.50"
                                  : "rgba(255, 152, 0, 0.08)"
                            : isSunday
                            ? (theme) =>
                                theme.palette.mode === "light"
                                  ? "grey.50"
                                  : "rgba(255,255,255,0.02)"
                            : "inherit",
                        }}
                      >
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>
                            {dayJs.format("DD MMM")}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {dayJs.format("ddd")}
                          </Typography>
                          {isToday && (
                            <Typography variant="caption" color="warning.dark" sx={{ display: "block" }}>
                              today
                            </Typography>
                          )}
                        </TableCell>
                        <CountCell value={0} variant="warning" />
                        <CountCell value={day.totalUnits} variant="info" />
                        <CountCell value={0} variant="secondary" />
                        <TableCell align="center">
                          <Typography
                            variant="body2"
                            fontWeight={600}
                            color={day.totalUnits > 0 ? "text.primary" : "text.disabled"}
                          >
                            {day.totalUnits || "—"}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="body2" color="text.disabled">—</Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Typography variant="body2" color="text.disabled">—</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            fontWeight={600}
                            color={day.impliedAmount > 0 ? "success.main" : "text.disabled"}
                          >
                            {day.impliedAmount > 0 ? `₹${formatINR(day.impliedAmount)}` : "—"}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" color="text.disabled">—</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" color="text.disabled">—</Typography>
                        </TableCell>
                        <TableCell>
                          {day.hasEntry ? (
                            mode === "mid" && day.note ? (
                              <Tooltip title={day.note}>
                                <Typography
                                  variant="caption"
                                  sx={{
                                    display: "block",
                                    maxWidth: 200,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {day.note}
                                  {day.workDone !== undefined && day.workDone > 0 && (
                                    <Typography
                                      component="span"
                                      variant="caption"
                                      color="text.secondary"
                                      sx={{ ml: 0.5 }}
                                    >
                                      · {day.workDone}d
                                    </Typography>
                                  )}
                                </Typography>
                              </Tooltip>
                            ) : mode === "mid" &&
                              day.workDone !== undefined &&
                              day.workDone > 0 ? (
                              <Typography variant="caption" color="text.secondary">
                                {day.workDone} day{day.workDone === 1 ? "" : "s"} of work
                              </Typography>
                            ) : (
                              <Stack direction="row" spacing={0.5} alignItems="center">
                                <Tooltip title="View photos">
                                  <CameraIcon fontSize="small" sx={{ color: "text.secondary" }} />
                                </Tooltip>
                                <Typography variant="caption" color="text.secondary">
                                  {mode === "mid" ? "Crew logged" : "Headcount logged"}
                                </Typography>
                              </Stack>
                            )
                          ) : (
                            <Typography variant="body2" color="text.disabled">—</Typography>
                          )}
                        </TableCell>
                        <TableCell align="center">
                          {!isFuture &&
                            (day.hasEntry ? (
                              <Stack direction="row" spacing={0.5} justifyContent="center">
                                <Chip
                                  label="Recorded"
                                  size="small"
                                  color="success"
                                  variant="outlined"
                                  sx={{ height: 22, fontSize: "0.65rem" }}
                                />
                                <IconButton
                                  size="small"
                                  onClick={() => onPickDate(day.date)}
                                  sx={{ color: tradeColor.main }}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Stack>
                            ) : (
                              <IconButton
                                size="small"
                                onClick={() => onPickDate(day.date)}
                                sx={{ color: tradeColor.main }}
                              >
                                <AddIcon fontSize="small" />
                              </IconButton>
                            ))}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {settleWeekStart !== null && (
        <WeeklyHeadcountSettleDialog
          open={true}
          onClose={() => setSettleWeekStart(null)}
          onSaved={() => {
            queryClient.invalidateQueries({
              queryKey: ["contract-headcount", contractId],
            });
            queryClient.invalidateQueries({
              queryKey: ["trade-attendance-summary", contractId],
            });
          }}
          siteId={siteId}
          contractId={contractId}
          contractTitle={contractTitle}
        />
      )}
    </>
  );
}

function CountCell({
  value,
  variant,
}: {
  value: number;
  variant: "warning" | "info" | "secondary";
}) {
  const colorMap = {
    warning: { color: "warning.dark", borderColor: "warning.main" },
    info: { color: "info.dark", borderColor: "info.main" },
    secondary: { color: "secondary.dark", borderColor: "secondary.main" },
  } as const;
  const { color, borderColor } = colorMap[variant];
  const isZero = value === 0;
  return (
    <TableCell align="center">
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 28,
          height: 28,
          borderRadius: "50%",
          border: 1,
          borderColor: isZero ? "divider" : borderColor,
          color: isZero ? "text.disabled" : color,
          fontSize: "0.85rem",
          fontWeight: 600,
        }}
      >
        {value}
      </Box>
    </TableCell>
  );
}
