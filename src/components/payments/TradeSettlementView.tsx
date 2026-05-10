"use client";

import React, { useMemo, useState } from "react";
import {
  Box,
  Paper,
  Stack,
  Typography,
  Chip,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  CircularProgress,
  Alert,
} from "@mui/material";
import { TaskAlt as SettleIcon } from "@mui/icons-material";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { weekStartOf, weekEndOf } from "@/lib/utils/weekUtils";
import { useContractHeadcount } from "@/hooks/queries/useContractHeadcount";
import { useContractMidEntries } from "@/hooks/queries/useContractMidEntries";
import { WeeklyHeadcountSettleDialog } from "@/components/trades/WeeklyHeadcountSettleDialog";
import { MestriSettleDialog } from "@/components/payments/MestriSettleDialog";
import type { LaborTrackingMode, TradeContract } from "@/types/trade.types";
import type { TradeColor } from "@/theme/tradeColors";

interface TradeSettlementViewProps {
  contract: TradeContract;
  tradeColor: TradeColor;
}

interface WeekRow {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  isCurrentWeek: boolean;
  earned: number;
  paid: number;
  balance: number;
  daysWithEntries: number;
}

function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

/**
 * Week-grouped settlement waterfall for a single trade contract.
 * Used in /site/payments when a trade chip is selected.
 *
 *   earned  = sum of day labor value for the week
 *             (mid: subcontract_mid_entries.day_total_amount;
 *              headcount: per-role units × daily_rate)
 *   paid    = sum of subcontract_payments.amount where
 *             period_from_date == weekStart
 *   balance = max(0, earned − paid)
 *
 * Settle button opens MestriSettleDialog (mid mode — Civil's full pipeline)
 * or WeeklyHeadcountSettleDialog (headcount mode) depending on the
 * contract's labor_tracking_mode.
 */
export function TradeSettlementView({
  contract,
  tradeColor,
}: TradeSettlementViewProps) {
  const supabase = createClient();
  const mode: LaborTrackingMode = contract.laborTrackingMode;

  const { data: headcount, isLoading: hcLoading } = useContractHeadcount(
    mode === "headcount" ? contract.id : undefined
  );
  const { data: midEntries, isLoading: midLoading } = useContractMidEntries(
    mode === "mid" ? contract.id : undefined
  );

  // Per-week paid amounts (from subcontract_payments grouped by period_from_date)
  const { data: weeklyPaid } = useQuery({
    queryKey: ["contract-weekly-paid", contract.id],
    enabled: !!contract.id,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<Map<string, number>> => {
      const sb = supabase as any;
      const { data, error } = await sb
        .from("subcontract_payments")
        .select("amount, period_from_date")
        .eq("contract_id", contract.id)
        .eq("is_deleted", false)
        .not("period_from_date", "is", null);
      if (error) throw error;
      const map = new Map<string, number>();
      for (const r of (data ?? []) as Array<{
        amount: number | string;
        period_from_date: string;
      }>) {
        const key = r.period_from_date;
        map.set(key, (map.get(key) ?? 0) + Number(r.amount ?? 0));
      }
      return map;
    },
  });

  const [settleWeekStart, setSettleWeekStart] = useState<string | null>(null);

  const isLoading =
    (mode === "headcount" && hcLoading) || (mode === "mid" && midLoading);

  const weeks: WeekRow[] = useMemo(() => {
    if (mode === "mesthri_only" || mode === "detailed") return [];
    const today = dayjs();
    const groups: WeekRow[] = [];
    const paidByWeek = weeklyPaid ?? new Map<string, number>();
    // Trailing 8 weeks so engineer can settle older unpaid weeks too
    for (let weekOffset = 0; weekOffset < 8; weekOffset++) {
      const anchor = today.subtract(weekOffset, "week");
      const wsDay = weekStartOf(anchor);
      const weDay = weekEndOf(anchor);
      const ws = wsDay.format("YYYY-MM-DD");
      const we = weDay.format("YYYY-MM-DD");
      const isCurrent = wsDay.isSame(weekStartOf(today), "day");
      const weekLabel = `${wsDay.format("D MMM")} – ${weDay.format("D MMM YYYY")}`;

      let earned = 0;
      let daysWithEntries = 0;

      if (mode === "headcount" && headcount) {
        const rateById = new Map(
          headcount.rates.map((r) => [r.roleId, r.dailyRate])
        );
        const dayHasEntry = new Set<string>();
        for (const e of headcount.recent) {
          if (e.attendanceDate < ws || e.attendanceDate > we) continue;
          const rate = rateById.get(e.roleId) ?? 0;
          earned += e.units * rate;
          dayHasEntry.add(e.attendanceDate);
        }
        daysWithEntries = dayHasEntry.size;
      } else if (mode === "mid" && midEntries) {
        for (const e of midEntries) {
          if (e.attendanceDate < ws || e.attendanceDate > we) continue;
          earned += e.dayTotalAmount;
          if (e.dayTotalAmount > 0 || e.laborerIds.length > 0) {
            daysWithEntries++;
          }
        }
      }

      const paid = paidByWeek.get(ws) ?? 0;
      const balance = Math.max(0, earned - paid);

      groups.push({
        weekStart: ws,
        weekEnd: we,
        weekLabel,
        isCurrentWeek: isCurrent,
        earned,
        paid,
        balance,
        daysWithEntries,
      });
    }
    return groups;
  }, [mode, headcount, midEntries, weeklyPaid]);

  const totalEarned = weeks.reduce((s, w) => s + w.earned, 0);
  const totalPaid = weeks.reduce((s, w) => s + w.paid, 0);
  const totalBalance = weeks.reduce((s, w) => s + w.balance, 0);

  if (mode === "mesthri_only") {
    return (
      <Alert severity="info" sx={{ m: 2 }}>
        <strong>Mesthri-only mode</strong> — no weekly waterfall (no daily
        attendance to compute earnings). Record one-off payments via the
        contract&apos;s 3-dot menu on /site/trades.
      </Alert>
    );
  }
  if (mode === "detailed") {
    return (
      <Alert severity="info" sx={{ m: 2 }}>
        <strong>Detailed mode</strong> — uses the same per-laborer waterfall as
        Civil. Switch back to the Civil chip to settle these.
      </Alert>
    );
  }

  return (
    <Box>
      {/* Summary band */}
      <Paper sx={{ p: 2, mb: 2, bgcolor: "background.paper" }}>
        <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
          <Box>
            <Typography variant="caption" color="text.secondary" component="div">
              Total earned (last 8 weeks)
            </Typography>
            <Typography variant="h6" fontWeight={700} sx={{ color: tradeColor.main }}>
              ₹{formatINR(totalEarned)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" component="div">
              Already paid
            </Typography>
            <Typography variant="h6" fontWeight={700} color="success.main">
              ₹{formatINR(totalPaid)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" component="div">
              Balance to settle
            </Typography>
            <Typography variant="h6" fontWeight={700} color="warning.dark">
              ₹{formatINR(totalBalance)}
            </Typography>
          </Box>
        </Stack>
      </Paper>

      {/* Per-week waterfall */}
      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <Paper sx={{ overflow: "hidden" }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: tradeColor.dark }}>
                  <TableCell sx={{ color: tradeColor.contrastText, fontWeight: 600 }}>
                    Week
                  </TableCell>
                  <TableCell
                    sx={{ color: tradeColor.contrastText, fontWeight: 600 }}
                    align="center"
                  >
                    Days
                  </TableCell>
                  <TableCell
                    sx={{ color: tradeColor.contrastText, fontWeight: 600 }}
                    align="right"
                  >
                    Earned
                  </TableCell>
                  <TableCell
                    sx={{ color: tradeColor.contrastText, fontWeight: 600 }}
                    align="right"
                  >
                    Paid
                  </TableCell>
                  <TableCell
                    sx={{ color: tradeColor.contrastText, fontWeight: 600 }}
                    align="right"
                  >
                    Balance
                  </TableCell>
                  <TableCell
                    sx={{ color: tradeColor.contrastText, fontWeight: 600 }}
                    align="center"
                  >
                    Action
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {weeks.map((week) => {
                  const fullySettled = week.earned > 0 && week.balance === 0;
                  const empty = week.earned === 0 && week.paid === 0;
                  return (
                    <TableRow
                      key={week.weekStart}
                      sx={{
                        opacity: empty ? 0.55 : 1,
                        bgcolor: week.isCurrentWeek ? "info.50" : "inherit",
                      }}
                    >
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>
                          {week.weekLabel}
                        </Typography>
                        {week.isCurrentWeek && (
                          <Chip
                            label="this week"
                            size="small"
                            color="info"
                            sx={{ height: 18, fontSize: "0.6rem", mt: 0.25 }}
                          />
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Typography
                          variant="body2"
                          color={week.daysWithEntries > 0 ? "text.primary" : "text.disabled"}
                        >
                          {week.daysWithEntries || "—"}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          fontWeight={600}
                          color={week.earned > 0 ? "text.primary" : "text.disabled"}
                        >
                          {week.earned > 0 ? `₹${formatINR(week.earned)}` : "—"}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          color={week.paid > 0 ? "success.main" : "text.disabled"}
                        >
                          {week.paid > 0 ? `₹${formatINR(week.paid)}` : "—"}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          fontWeight={600}
                          color={
                            week.balance > 0
                              ? "warning.dark"
                              : fullySettled
                              ? "success.main"
                              : "text.disabled"
                          }
                        >
                          {week.balance > 0
                            ? `₹${formatINR(week.balance)}`
                            : fullySettled
                            ? "settled"
                            : "—"}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        {week.balance > 0 && !week.isCurrentWeek && (
                          <Button
                            size="small"
                            variant="contained"
                            startIcon={<SettleIcon />}
                            onClick={() => setSettleWeekStart(week.weekStart)}
                            sx={{
                              bgcolor: tradeColor.main,
                              "&:hover": { bgcolor: tradeColor.dark },
                              color: tradeColor.contrastText,
                            }}
                          >
                            Settle
                          </Button>
                        )}
                        {week.balance > 0 && week.isCurrentWeek && (
                          <Typography variant="caption" color="text.secondary">
                            wait until week ends
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Settle dialog — mode-aware.
          - Headcount: existing WeeklyHeadcountSettleDialog (writes
            subcontract_payments directly).
          - Mid: MestriSettleDialog — Civil's full pipeline. Writes
            settlement_groups + labor_payments + subcontract_payments and
            shows up in /site/expenses as "Contract Salary" (same as Civil).
            We pre-fill the suggested amount from the week's earned − paid. */}
      {settleWeekStart !== null && mode === "headcount" && (
        <WeeklyHeadcountSettleDialog
          open={true}
          onClose={() => setSettleWeekStart(null)}
          onSaved={() => {
            /* invalidation handled inside */
          }}
          siteId={contract.siteId}
          contractId={contract.id}
          contractTitle={contract.title}
        />
      )}
      {settleWeekStart !== null && mode === "mid" && (() => {
        const week = weeks.find((w) => w.weekStart === settleWeekStart);
        return (
          <MestriSettleDialog
            open={true}
            onClose={() => setSettleWeekStart(null)}
            siteId={contract.siteId}
            mode="fill-week"
            weekStart={settleWeekStart}
            weekEnd={week?.weekEnd}
            suggestedAmount={week?.balance ?? 0}
            initialSubcontractId={contract.id}
          />
        );
      })()}
    </Box>
  );
}
