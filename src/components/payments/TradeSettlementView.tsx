"use client";

import React, { useMemo, useState } from "react";
import {
  Box,
  Paper,
  Stack,
  Typography,
  Chip,
  Button,
  CircularProgress,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  IconButton,
  Tooltip,
  alpha,
  useTheme,
} from "@mui/material";
import {
  TaskAlt as SettleIcon,
  CalendarViewWeek as WaterfallIcon,
  Receipt as BySettlementIcon,
  CalendarMonth as ByDateIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { weekStartOf, weekEndOf } from "@/lib/utils/weekUtils";
import { useContractHeadcount } from "@/hooks/queries/useContractHeadcount";
import { useContractMidEntries } from "@/hooks/queries/useContractMidEntries";
import { WeeklyHeadcountSettleDialog } from "@/components/trades/WeeklyHeadcountSettleDialog";
import { MestriSettleDialog } from "@/components/payments/MestriSettleDialog";
import DeleteContractSettlementDialog from "@/components/payments/DeleteContractSettlementDialog";
import ContractSettlementEditDialog from "@/components/payments/ContractSettlementEditDialog";
import type { LaborTrackingMode, TradeContract } from "@/types/trade.types";
import type { TradeColor } from "@/theme/tradeColors";
import type { DateWiseSettlement, PaymentMode, PaymentChannel } from "@/types/payment.types";

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

// Matches the internal SettlementRecord shape in DeleteContractSettlementDialog
interface SettlementRecord {
  id: string;
  settlementReference: string;
  settlementDate: string;
  totalAmount: number;
  paymentMode: string | null;
  paymentChannel: string;
  paymentType: string | null;
  payerSource: string | null;
  payerName: string | null;
  subcontractId: string | null;
  subcontractTitle: string | null;
  proofUrl: string | null;
  proofUrls: string[];
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  laborerCount: number;
  weekAllocations: { weekStart: string; weekEnd: string; amount: number }[];
}

interface HeadcountSettlement {
  id: string;
  amount: number;
  period_from_date: string | null;
  period_to_date: string | null;
  payment_mode: string | null;
  notes: string | null;
  created_at: string;
}

function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

function PayerBadge({ source, name }: { source?: string | null; name?: string | null }) {
  const label =
    source === "client" ? "Client"
    : source === "own" ? "Own"
    : source === "site_cash" ? "Site Cash"
    : source === "company" ? "Company"
    : name || source || "Unknown";
  return (
    <Chip size="small" label={label} variant="outlined"
      sx={{ fontSize: "0.65rem", height: 18 }} />
  );
}

/**
 * Week-grouped settlement waterfall for a single trade contract.
 *
 * Two views via toggle:
 *   - Weekly waterfall: trailing 8 weeks, earned vs paid, Settle button
 *   - By settlement: flat list of recorded settlements with delete action
 *
 * Mid mode settlements route through Civil's processContractPayment pipeline
 * (settlement_groups + labor_payments). Headcount mode writes directly to
 * subcontract_payments. Both tables are read for weeklyPaid totals.
 */
export function TradeSettlementView({
  contract,
  tradeColor,
}: TradeSettlementViewProps) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const mode: LaborTrackingMode = contract.laborTrackingMode;

  const [viewMode, setViewMode] = useState<"waterfall" | "by-settlement" | "by-date">("waterfall");
  const [settleWeekStart, setSettleWeekStart] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SettlementRecord | null>(null);
  const [editTarget, setEditTarget] = useState<DateWiseSettlement | null>(null);
  const [headcountDeletingId, setHeadcountDeletingId] = useState<string | null>(null);

  // Convert SettlementRecord → DateWiseSettlement for ContractSettlementEditDialog
  const toEditable = (s: SettlementRecord): DateWiseSettlement => ({
    settlementGroupId: s.id,
    settlementReference: s.settlementReference,
    settlementDate: s.settlementDate,
    totalAmount: s.totalAmount,
    weekAllocations: [],
    paymentMode: s.paymentMode as PaymentMode | null,
    paymentChannel: (s.paymentChannel || "direct") as PaymentChannel,
    payerSource: s.payerSource,
    payerName: s.payerName,
    proofUrls: s.proofUrls ?? [],
    notes: s.notes,
    subcontractId: s.subcontractId,
    subcontractTitle: s.subcontractTitle,
    createdBy: s.createdBy || "",
    createdByName: s.createdBy,
    createdAt: s.createdAt,
    isCancelled: false,
  });

  const { data: headcount, isLoading: hcLoading } = useContractHeadcount(
    mode === "headcount" ? contract.id : undefined
  );
  const { data: midEntries, isLoading: midLoading } = useContractMidEntries(
    mode === "mid" ? contract.id : undefined
  );

  // Per-week paid amounts. Reads BOTH tables because:
  //   • labor_payments  — where processContractPayment (MestriSettleDialog/mid)
  //     writes, keyed by payment_for_date == weekStart.
  //   • subcontract_payments — where WeeklyHeadcountSettleDialog writes,
  //     keyed by period_from_date.
  const { data: weeklyPaid } = useQuery({
    queryKey: ["contract-weekly-paid", contract.id],
    enabled: !!contract.id,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<Map<string, number>> => {
      const sb = supabase as any;
      const [laborRes, subRes] = await Promise.all([
        sb
          .from("labor_payments")
          .select("amount, payment_for_date")
          .eq("subcontract_id", contract.id)
          .eq("is_under_contract", true)
          .not("payment_for_date", "is", null),
        sb
          .from("subcontract_payments")
          .select("amount, period_from_date")
          .eq("contract_id", contract.id)
          .eq("is_deleted", false)
          .not("period_from_date", "is", null),
      ]);
      if (laborRes.error) throw laborRes.error;
      if (subRes.error) throw subRes.error;
      const map = new Map<string, number>();
      for (const r of (laborRes.data ?? []) as Array<{ amount: number | string; payment_for_date: string }>) {
        const key = r.payment_for_date;
        map.set(key, (map.get(key) ?? 0) + Number(r.amount ?? 0));
      }
      for (const r of (subRes.data ?? []) as Array<{ amount: number | string; period_from_date: string }>) {
        const key = r.period_from_date;
        map.set(key, (map.get(key) ?? 0) + Number(r.amount ?? 0));
      }
      return map;
    },
  });

  // "By settlement" view data
  const {
    data: settlementItems,
    isLoading: settlementLoading,
  } = useQuery({
    queryKey: ["trade-settlement-history", contract.id, mode],
    enabled: !!contract.id && viewMode === "by-settlement",
    staleTime: 30 * 1000,
    queryFn: async (): Promise<SettlementRecord[] | HeadcountSettlement[]> => {
      const sb = supabase as any;
      if (mode === "mid") {
        // Get settlement_group_ids via labor_payments for this subcontract
        const lpRes = await sb
          .from("labor_payments")
          .select("settlement_group_id")
          .eq("subcontract_id", contract.id)
          .eq("is_under_contract", true)
          .not("settlement_group_id", "is", null);
        if (lpRes.error) throw lpRes.error;
        const sgIds = [
          ...new Set(
            (lpRes.data ?? []).map((r: any) => r.settlement_group_id as string)
          ),
        ];
        if (sgIds.length === 0) return [];
        const sgRes = await sb
          .from("settlement_groups")
          .select(
            "id, settlement_reference, settlement_date, total_amount, payment_mode, payment_channel, payment_type, payer_source, payer_name, proof_url, proof_urls, notes, created_by_name, created_at, week_allocations, subcontract_id"
          )
          .in("id", sgIds)
          .eq("is_cancelled", false)
          .order("settlement_date", { ascending: false });
        if (sgRes.error) throw sgRes.error;
        return (sgRes.data ?? []).map(
          (r: any): SettlementRecord => ({
            id: r.id,
            settlementReference: r.settlement_reference,
            settlementDate: r.settlement_date,
            totalAmount: Number(r.total_amount ?? 0),
            paymentMode: r.payment_mode,
            paymentChannel: r.payment_channel ?? "direct",
            paymentType: r.payment_type,
            payerSource: r.payer_source,
            payerName: r.payer_name,
            subcontractId: r.subcontract_id,
            subcontractTitle: contract.title,
            proofUrl: r.proof_url,
            proofUrls: r.proof_urls ?? [],
            notes: r.notes,
            createdBy: r.created_by_name,
            createdAt: r.created_at,
            laborerCount: 0,
            weekAllocations: r.week_allocations ?? [],
          })
        );
      } else {
        // Headcount: subcontract_payments
        const res = await sb
          .from("subcontract_payments")
          .select(
            "id, amount, period_from_date, period_to_date, payment_mode, notes, created_at"
          )
          .eq("contract_id", contract.id)
          .eq("is_deleted", false)
          .order("created_at", { ascending: false });
        if (res.error) throw res.error;
        return res.data ?? [];
      }
    },
  });

  const isLoading =
    (mode === "headcount" && hcLoading) || (mode === "mid" && midLoading);

  const weeks: WeekRow[] = useMemo(() => {
    if (mode === "mesthri_only" || mode === "detailed") return [];
    const today = dayjs();
    const groups: WeekRow[] = [];
    const paidByWeek = weeklyPaid ?? new Map<string, number>();
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

  const invalidateAll = () => {
    queryClient.invalidateQueries({
      queryKey: ["contract-weekly-paid", contract.id],
    });
    queryClient.invalidateQueries({
      queryKey: ["trade-attendance-summary", contract.id],
    });
    queryClient.invalidateQueries({ queryKey: ["trade-reconciliations"] });
    queryClient.invalidateQueries({
      queryKey: ["trade-settlement-history", contract.id, mode],
    });
  };

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

  const isMidMode = mode === "mid";

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

      {/* View toggle */}
      <Box sx={{ mb: 1.5, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <ToggleButtonGroup
          size="small"
          value={viewMode}
          exclusive
          onChange={(_, v) => {
            if (v) setViewMode(v);
          }}
        >
          <ToggleButton value="waterfall" sx={{ gap: 0.5, textTransform: "none", fontSize: "0.78rem" }}>
            <WaterfallIcon sx={{ fontSize: 15 }} />
            Weekly waterfall
          </ToggleButton>
          <ToggleButton value="by-settlement" sx={{ gap: 0.5, textTransform: "none", fontSize: "0.78rem" }}>
            <BySettlementIcon sx={{ fontSize: 15 }} />
            By settlement
          </ToggleButton>
          <ToggleButton value="by-date" sx={{ gap: 0.5, textTransform: "none", fontSize: "0.78rem" }}>
            <ByDateIcon sx={{ fontSize: 15 }} />
            By date
          </ToggleButton>
        </ToggleButtonGroup>
        {(viewMode === "by-settlement" || viewMode === "by-date") && settlementItems && (
          <Typography variant="caption" color="text.secondary">
            {settlementItems.length}{" "}
            {settlementItems.length === 1 ? "settlement" : "settlements"}
          </Typography>
        )}
      </Box>

      {/* ─── Weekly waterfall — card-style rows, no Table hover issues ─── */}
      {viewMode === "waterfall" && (
        isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {/* Header */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr 52px 90px 90px 90px 108px",
                gap: 1,
                px: 1.75,
                py: 0.85,
                bgcolor: tradeColor.dark,
                borderRadius: 1,
              }}
            >
              {["Week", "Days", "Earned", "Paid", "Balance", ""].map((h) => (
                <Typography
                  key={h}
                  variant="caption"
                  sx={{
                    color: tradeColor.contrastText,
                    fontWeight: 700,
                    fontSize: "0.67rem",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  {h}
                </Typography>
              ))}
            </Box>

            {weeks.map((week) => {
              const fullySettled = week.earned > 0 && week.balance === 0;
              const empty = week.earned === 0 && week.paid === 0;
              return (
                <Box
                  key={week.weekStart}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "1fr 52px 90px 90px 90px 108px",
                    gap: 1,
                    px: 1.75,
                    py: 1.25,
                    bgcolor: week.isCurrentWeek
                      ? alpha(theme.palette.info.main, 0.06)
                      : "background.paper",
                    border: 1,
                    borderColor: week.isCurrentWeek
                      ? alpha(theme.palette.info.main, 0.35)
                      : "divider",
                    borderRadius: 1.5,
                    opacity: empty ? 0.55 : 1,
                    alignItems: "center",
                  }}
                >
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      {week.weekLabel}
                    </Typography>
                    {week.isCurrentWeek && (
                      <Chip
                        label="this week"
                        size="small"
                        color="info"
                        sx={{ height: 16, fontSize: "0.58rem", mt: 0.25 }}
                      />
                    )}
                  </Box>

                  <Typography
                    variant="body2"
                    color={
                      week.daysWithEntries > 0 ? "text.primary" : "text.disabled"
                    }
                    sx={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {week.daysWithEntries || "—"}
                  </Typography>

                  <Typography
                    variant="body2"
                    fontWeight={600}
                    color={week.earned > 0 ? "text.primary" : "text.disabled"}
                    sx={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {week.earned > 0 ? `₹${formatINR(week.earned)}` : "—"}
                  </Typography>

                  <Typography
                    variant="body2"
                    color={week.paid > 0 ? "success.main" : "text.disabled"}
                    sx={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {week.paid > 0 ? `₹${formatINR(week.paid)}` : "—"}
                  </Typography>

                  <Typography
                    variant="body2"
                    fontWeight={week.balance > 0 ? 700 : 400}
                    color={
                      week.balance > 0
                        ? "warning.dark"
                        : fullySettled
                        ? "success.main"
                        : "text.disabled"
                    }
                    sx={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {week.balance > 0
                      ? `₹${formatINR(week.balance)}`
                      : fullySettled
                      ? "✓ Settled"
                      : "—"}
                  </Typography>

                  <Box>
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
                          fontSize: "0.7rem",
                          px: 1.25,
                          minWidth: 0,
                        }}
                      >
                        Settle
                      </Button>
                    )}
                    {week.balance > 0 && week.isCurrentWeek && (
                      <Typography variant="caption" color="text.secondary">
                        in progress
                      </Typography>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        )
      )}

      {/* ─── By Settlement / By Date shared renderer ─── */}
      {(viewMode === "by-settlement" || viewMode === "by-date") && (
        settlementLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : !settlementItems || settlementItems.length === 0 ? (
          <Box sx={{ py: 5, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              No settlements recorded yet.
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Switch to Weekly waterfall and tap Settle to record one.
            </Typography>
          </Box>
        ) : isMidMode ? (
          (() => {
            const records = settlementItems as SettlementRecord[];
            // For "by-date": group by settlementDate; "by-settlement": single flat list
            const grouped: { dateLabel: string; items: SettlementRecord[] }[] =
              viewMode === "by-date"
                ? Object.entries(
                    records.reduce<Record<string, SettlementRecord[]>>((acc, s) => {
                      const key = s.settlementDate;
                      (acc[key] = acc[key] || []).push(s);
                      return acc;
                    }, {})
                  )
                    .sort(([a], [b]) => (a < b ? 1 : -1))
                    .map(([date, items]) => ({
                      dateLabel: dayjs(date).format("ddd, D MMM YYYY"),
                      items,
                    }))
                : [{ dateLabel: "", items: records }];

            return (
              <Box sx={{ display: "flex", flexDirection: "column", gap: viewMode === "by-date" ? 2 : 1 }}>
                {grouped.map((group) => (
                  <Box key={group.dateLabel}>
                    {viewMode === "by-date" && (
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: 0.6,
                          color: "text.secondary",
                          display: "block",
                          mb: 0.75,
                          pl: 0.5,
                        }}
                      >
                        {group.dateLabel}
                      </Typography>
                    )}
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      {group.items.map((s) => (
                        <Box
                          key={s.id}
                          sx={{
                            px: 2,
                            py: 1.5,
                            bgcolor: "background.paper",
                            border: 1,
                            borderColor: "divider",
                            borderRadius: 1.5,
                            display: "flex",
                            alignItems: "center",
                            gap: 2,
                            flexWrap: "wrap",
                          }}
                        >
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Stack
                              direction="row"
                              spacing={0.75}
                              alignItems="center"
                              flexWrap="wrap"
                              useFlexGap
                            >
                              <Typography
                                variant="caption"
                                sx={{
                                  fontFamily: "monospace",
                                  fontWeight: 700,
                                  bgcolor: alpha(tradeColor.main, 0.08),
                                  color: tradeColor.main,
                                  border: `1px solid ${alpha(tradeColor.main, 0.25)}`,
                                  borderRadius: 0.5,
                                  px: 0.75,
                                  py: 0.1,
                                }}
                              >
                                {s.settlementReference}
                              </Typography>
                              {viewMode === "by-settlement" && (
                                <Typography variant="caption" color="text.secondary">
                                  {dayjs(s.settlementDate).format("DD MMM YYYY")}
                                </Typography>
                              )}
                              {s.payerSource && (
                                <PayerBadge source={s.payerSource} name={s.payerName} />
                              )}
                            </Stack>
                            {s.weekAllocations && s.weekAllocations.length > 0 && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ mt: 0.25, display: "block" }}
                              >
                                Week:{" "}
                                {dayjs(s.weekAllocations[0].weekStart).format("D MMM")} –{" "}
                                {dayjs(s.weekAllocations[0].weekEnd).format("D MMM YYYY")}
                              </Typography>
                            )}
                            {s.notes && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ mt: 0.25, display: "block", fontStyle: "italic" }}
                              >
                                {s.notes}
                              </Typography>
                            )}
                          </Box>
                          <Typography
                            variant="body1"
                            fontWeight={700}
                            sx={{ fontVariantNumeric: "tabular-nums", color: tradeColor.main }}
                          >
                            ₹{formatINR(s.totalAmount)}
                          </Typography>
                          <Tooltip title="Edit settlement">
                            <IconButton
                              size="small"
                              onClick={() => setEditTarget(toEditable(s))}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete settlement">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => setDeleteTarget(s)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                ))}
              </Box>
            );
          })()
        ) : (
          // Headcount mode — subcontract_payments, date-grouped when in by-date
          (() => {
            const records = settlementItems as HeadcountSettlement[];
            const grouped: { dateLabel: string; items: HeadcountSettlement[] }[] =
              viewMode === "by-date"
                ? Object.entries(
                    records.reduce<Record<string, HeadcountSettlement[]>>((acc, s) => {
                      const key = s.period_from_date ?? s.created_at.slice(0, 10);
                      (acc[key] = acc[key] || []).push(s);
                      return acc;
                    }, {})
                  )
                    .sort(([a], [b]) => (a < b ? 1 : -1))
                    .map(([date, items]) => ({
                      dateLabel: dayjs(date).format("ddd, D MMM YYYY"),
                      items,
                    }))
                : [{ dateLabel: "", items: records }];

            return (
              <Box sx={{ display: "flex", flexDirection: "column", gap: viewMode === "by-date" ? 2 : 1 }}>
                {grouped.map((group) => (
                  <Box key={group.dateLabel}>
                    {viewMode === "by-date" && (
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: 0.6,
                          color: "text.secondary",
                          display: "block",
                          mb: 0.75,
                          pl: 0.5,
                        }}
                      >
                        {group.dateLabel}
                      </Typography>
                    )}
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      {group.items.map((s) => (
                        <Box
                          key={s.id}
                          sx={{
                            px: 2,
                            py: 1.5,
                            bgcolor: "background.paper",
                            border: 1,
                            borderColor: "divider",
                            borderRadius: 1.5,
                            display: "flex",
                            alignItems: "center",
                            gap: 2,
                            flexWrap: "wrap",
                          }}
                        >
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="caption" color="text.secondary">
                              {dayjs(s.created_at).format("DD MMM YYYY")}
                              {s.period_from_date &&
                                ` · Week: ${dayjs(s.period_from_date).format("D MMM")}`}
                              {s.period_to_date &&
                                ` – ${dayjs(s.period_to_date).format("D MMM YYYY")}`}
                            </Typography>
                            {s.notes && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ mt: 0.25, display: "block", fontStyle: "italic" }}
                              >
                                {s.notes}
                              </Typography>
                            )}
                          </Box>
                          <Typography
                            variant="body1"
                            fontWeight={700}
                            sx={{ fontVariantNumeric: "tabular-nums", color: tradeColor.main }}
                          >
                            ₹{formatINR(Number(s.amount))}
                          </Typography>
                          <Tooltip title="Delete settlement">
                            <span>
                              <IconButton
                                size="small"
                                color="error"
                                disabled={headcountDeletingId === s.id}
                                onClick={async () => {
                                  setHeadcountDeletingId(s.id);
                                  try {
                                    await (supabase as any)
                                      .from("subcontract_payments")
                                      .update({ is_deleted: true })
                                      .eq("id", s.id);
                                    invalidateAll();
                                  } finally {
                                    setHeadcountDeletingId(null);
                                  }
                                }}
                              >
                                {headcountDeletingId === s.id ? (
                                  <CircularProgress size={14} color="inherit" />
                                ) : (
                                  <DeleteIcon fontSize="small" />
                                )}
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                ))}
              </Box>
            );
          })()
        )
      )}

      {/* ─── Settle dialog — mode-aware ─── */}
      {settleWeekStart !== null && mode === "headcount" && (
        <WeeklyHeadcountSettleDialog
          open={true}
          onClose={() => setSettleWeekStart(null)}
          onSaved={() => {}}
          siteId={contract.siteId}
          contractId={contract.id}
          contractTitle={contract.title}
        />
      )}
      {settleWeekStart !== null &&
        mode === "mid" &&
        (() => {
          const week = weeks.find((w) => w.weekStart === settleWeekStart);
          return (
            <MestriSettleDialog
              open={true}
              onClose={() => {
                setSettleWeekStart(null);
                invalidateAll();
              }}
              siteId={contract.siteId}
              mode="fill-week"
              weekStart={settleWeekStart}
              weekEnd={week?.weekEnd}
              suggestedAmount={week?.balance ?? 0}
              initialSubcontractId={contract.id}
            />
          );
        })()}

      {/* ─── Edit dialog for mid-mode settlements ─── */}
      <ContractSettlementEditDialog
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        settlement={editTarget}
        onSuccess={() => {
          setEditTarget(null);
          invalidateAll();
        }}
      />

      {/* ─── Delete dialog for mid-mode settlements ─── */}
      <DeleteContractSettlementDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        settlement={deleteTarget}
        onSuccess={() => {
          setDeleteTarget(null);
          invalidateAll();
        }}
      />
    </Box>
  );
}
