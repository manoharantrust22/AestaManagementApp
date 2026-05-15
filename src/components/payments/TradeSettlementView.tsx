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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
} from "@mui/material";
import {
  TaskAlt as SettleIcon,
  CalendarViewWeek as WaterfallIcon,
  Receipt as BySettlementIcon,
  CalendarMonth as ByDateIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Close as CloseIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { weekStartOf, weekEndOf } from "@/lib/utils/weekUtils";
import { useContractHeadcount } from "@/hooks/queries/useContractHeadcount";
import { useContractMidEntries } from "@/hooks/queries/useContractMidEntries";
import { WeeklyHeadcountSettleDialog } from "@/components/trades/WeeklyHeadcountSettleDialog";
import { MestriSettleDialog } from "@/components/payments/MestriSettleDialog";
import ContractSettleViaWallet from "@/components/payments/ContractSettleViaWallet";
import DeleteContractSettlementDialog from "@/components/payments/DeleteContractSettlementDialog";
import ContractSettlementEditDialog from "@/components/payments/ContractSettlementEditDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useSelectedSite } from "@/contexts/SiteContext";
import { useCurrentUserWalletEnabled } from "@/hooks/queries/useEngineerWalletV2";
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
    : source === "own_money" ? "Own"
    : source === "site_cash" ? "Site Cash"
    : source === "company" ? "Company"
    : name || source || "Unknown";
  return (
    <Chip size="small" label={label} variant="outlined"
      sx={{ fontSize: "0.65rem", height: 18 }} />
  );
}

// ─── Week Detail Dialog ───────────────────────────────────────────────────────

interface WeekDetailDialogProps {
  week: WeekRow | null;
  onClose: () => void;
  onSettle: (weekStart: string) => void;
  tradeColor: TradeColor;
  midEntries: Array<{
    attendanceDate: string;
    dayTotalAmount: number;
    laborerIds: string[];
    workDoneUnits: number;
    note: string | null;
  }> | null | undefined;
  headcountEntries: Array<{
    attendanceDate: string;
    units: number;
    roleId: string;
  }> | null | undefined;
  headcountRates: Array<{ roleId: string; dailyRate: number }> | null | undefined;
  mode: LaborTrackingMode;
}

function WeekDetailDialog({
  week,
  onClose,
  onSettle,
  tradeColor,
  midEntries,
  headcountEntries,
  headcountRates,
  mode,
}: WeekDetailDialogProps) {
  const theme = useTheme();
  if (!week) return null;

  const fullySettled = week.earned > 0 && week.balance === 0;
  const canSettle = week.balance > 0 && !week.isCurrentWeek;

  // Build daily rows for this week
  const dailyRows: Array<{
    date: string;
    dateLabel: string;
    count: number;
    earned: number;
    workDone: number;
    note: string | null;
  }> = [];

  if (mode === "mid" && midEntries) {
    const filtered = midEntries
      .filter((e) => e.attendanceDate >= week.weekStart && e.attendanceDate <= week.weekEnd)
      .sort((a, b) => (a.attendanceDate < b.attendanceDate ? 1 : -1));
    for (const e of filtered) {
      dailyRows.push({
        date: e.attendanceDate,
        dateLabel: dayjs(e.attendanceDate).format("ddd, D MMM"),
        count: e.laborerIds.length,
        earned: e.dayTotalAmount,
        workDone: e.workDoneUnits,
        note: e.note,
      });
    }
  } else if (mode === "headcount" && headcountEntries && headcountRates) {
    const rateById = new Map(headcountRates.map((r) => [r.roleId, r.dailyRate]));
    // Group by date
    const byDate = new Map<string, number>();
    const countByDate = new Map<string, number>();
    for (const e of headcountEntries) {
      if (e.attendanceDate < week.weekStart || e.attendanceDate > week.weekEnd) continue;
      const rate = rateById.get(e.roleId) ?? 0;
      byDate.set(e.attendanceDate, (byDate.get(e.attendanceDate) ?? 0) + e.units * rate);
      countByDate.set(e.attendanceDate, (countByDate.get(e.attendanceDate) ?? 0) + e.units);
    }
    const dates = Array.from(byDate.keys()).sort((a, b) => (a < b ? 1 : -1));
    for (const date of dates) {
      dailyRows.push({
        date,
        dateLabel: dayjs(date).format("ddd, D MMM"),
        count: countByDate.get(date) ?? 0,
        earned: byDate.get(date) ?? 0,
        workDone: 0,
        note: null,
      });
    }
  }

  return (
    <Dialog
      open={!!week}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 2 } }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          pb: 1,
          borderBottom: `1px solid ${theme.palette.divider}`,
          bgcolor: alpha(tradeColor.main, 0.05),
        }}
      >
        <Box>
          <Typography variant="subtitle1" fontWeight={700}>
            {week.weekLabel}
          </Typography>
          {week.isCurrentWeek && (
            <Chip label="Current week" size="small" color="info"
              sx={{ height: 18, fontSize: "0.6rem", mt: 0.25 }} />
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {fullySettled && (
            <Chip
              icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
              label="Settled"
              size="small"
              color="success"
              sx={{ fontWeight: 700 }}
            />
          )}
          {week.balance > 0 && !week.isCurrentWeek && (
            <Chip
              icon={<WarningIcon sx={{ fontSize: 14 }} />}
              label={`₹${formatINR(week.balance)} pending`}
              size="small"
              color="warning"
              sx={{ fontWeight: 700 }}
            />
          )}
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 2.5 }}>
        {/* Summary chips */}
        <Stack direction="row" spacing={2} sx={{ mb: 2.5 }} flexWrap="wrap" useFlexGap>
          <Box>
            <Typography variant="caption" color="text.secondary" component="div">Earned</Typography>
            <Typography variant="h6" fontWeight={700} sx={{ color: tradeColor.main }}>
              {week.earned > 0 ? `₹${formatINR(week.earned)}` : "—"}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" component="div">Paid</Typography>
            <Typography variant="h6" fontWeight={700} color="success.main">
              {week.paid > 0 ? `₹${formatINR(week.paid)}` : "—"}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" component="div">Balance</Typography>
            <Typography variant="h6" fontWeight={700}
              color={week.balance > 0 ? "warning.dark" : fullySettled ? "success.main" : "text.disabled"}>
              {week.balance > 0 ? `₹${formatINR(week.balance)}` : fullySettled ? "✓ Settled" : "—"}
            </Typography>
          </Box>
        </Stack>

        <Divider sx={{ mb: 2 }} />

        {/* Daily breakdown */}
        {dailyRows.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
            No attendance entries recorded for this week.
          </Typography>
        ) : (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 1 }}>
              Daily breakdown · {week.daysWithEntries} days
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
              {dailyRows.map((row) => (
                <Box
                  key={row.date}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    px: 1.5,
                    py: 1,
                    bgcolor: alpha(tradeColor.main, 0.04),
                    border: `1px solid ${alpha(tradeColor.main, 0.12)}`,
                    borderRadius: 1,
                    gap: 2,
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600}>{row.dateLabel}</Typography>
                    {row.note && (
                      <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
                        {row.note}
                      </Typography>
                    )}
                  </Box>
                  {row.count > 0 && (
                    <Chip size="small" label={`${row.count} present`} variant="outlined"
                      sx={{ fontSize: "0.65rem", height: 20 }} />
                  )}
                  {row.workDone > 0 && (
                    <Chip size="small" label={`${row.workDone} days work`} variant="outlined"
                      sx={{ fontSize: "0.65rem", height: 20 }} />
                  )}
                  <Typography variant="body2" fontWeight={700}
                    sx={{ fontVariantNumeric: "tabular-nums", color: row.earned > 0 ? tradeColor.main : "text.disabled" }}>
                    {row.earned > 0 ? `₹${formatINR(row.earned)}` : "—"}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: `1px solid ${theme.palette.divider}`, justifyContent: "flex-end" }}>
        <Button onClick={onClose} size="small">Close</Button>
        {canSettle && (
          <Button
            variant="contained"
            size="small"
            startIcon={<SettleIcon />}
            onClick={() => { onClose(); onSettle(week.weekStart); }}
            sx={{
              bgcolor: tradeColor.main,
              "&:hover": { bgcolor: tradeColor.dark },
              color: tradeColor.contrastText,
            }}
          >
            Settle ₹{formatINR(week.balance)}
          </Button>
        )}
        {week.isCurrentWeek && week.balance > 0 && (
          <Chip label="Week in progress — settle after Sunday" size="small" color="info" />
        )}
      </DialogActions>
    </Dialog>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function TradeSettlementView({
  contract,
  tradeColor,
}: TradeSettlementViewProps) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const mode: LaborTrackingMode = contract.laborTrackingMode;

  const { userProfile } = useAuth();
  const { selectedSite } = useSelectedSite();
  const { data: isWalletEnabled } = useCurrentUserWalletEnabled(
    userProfile?.id,
    (selectedSite as any)?.company_id,
  );
  const isWalletEngineer =
    userProfile?.role === "site_engineer" && isWalletEnabled === true;

  const [viewMode, setViewMode] = useState<"waterfall" | "by-settlement" | "by-date">("waterfall");
  const [selectedWeek, setSelectedWeek] = useState<WeekRow | null>(null);
  const [settleWeekStart, setSettleWeekStart] = useState<string | null>(null);
  const [walletSettleOpen, setWalletSettleOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SettlementRecord | null>(null);
  const [editTarget, setEditTarget] = useState<DateWiseSettlement | null>(null);
  const [headcountDeletingId, setHeadcountDeletingId] = useState<string | null>(null);

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

  // Fetch contract start date to trim leading empty weeks
  const { data: contractMeta } = useQuery({
    queryKey: ["contract-start-date", contract.id],
    enabled: !!contract.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{ start_date: string | null }> => {
      const res = await (supabase as any)
        .from("subcontracts")
        .select("start_date")
        .eq("id", contract.id)
        .single();
      return (res.data as { start_date: string | null }) ?? { start_date: null };
    },
  });
  const contractStartDate = contractMeta?.start_date ?? null;

  const { data: headcount, isLoading: hcLoading } = useContractHeadcount(
    mode === "headcount" ? contract.id : undefined
  );
  const { data: midEntries, isLoading: midLoading } = useContractMidEntries(
    mode === "mid" ? contract.id : undefined
  );

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

  const { data: settlementItems, isLoading: settlementLoading } = useQuery({
    queryKey: ["trade-settlement-history", contract.id, mode],
    enabled: !!contract.id && (viewMode === "by-settlement" || viewMode === "by-date"),
    staleTime: 30 * 1000,
    queryFn: async (): Promise<SettlementRecord[] | HeadcountSettlement[]> => {
      const sb = supabase as any;
      if (mode === "mid") {
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
        return (sgRes.data ?? []).map((r: any): SettlementRecord => ({
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
        }));
      } else {
        const res = await sb
          .from("subcontract_payments")
          .select("id, amount, period_from_date, period_to_date, payment_mode, notes, created_at")
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
    for (let weekOffset = 0; weekOffset < 12; weekOffset++) {
      const anchor = today.subtract(weekOffset, "week");
      const wsDay = weekStartOf(anchor);
      const weDay = weekEndOf(anchor);
      const ws = wsDay.format("YYYY-MM-DD");
      const we = weDay.format("YYYY-MM-DD");

      // Skip weeks that ended before the contract started
      if (contractStartDate && we < contractStartDate) continue;

      const isCurrent = wsDay.isSame(weekStartOf(today), "day");
      const weekLabel = `${wsDay.format("D MMM")} – ${weDay.format("D MMM YYYY")}`;

      let earned = 0;
      let daysWithEntries = 0;

      if (mode === "headcount" && headcount) {
        const rateById = new Map(headcount.rates.map((r) => [r.roleId, r.dailyRate]));
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
          if (e.dayTotalAmount > 0 || e.laborerIds.length > 0) daysWithEntries++;
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
  }, [mode, headcount, midEntries, weeklyPaid, contractStartDate]);

  const totalEarned = weeks.reduce((s, w) => s + w.earned, 0);
  const totalBalance = weeks.reduce((s, w) => s + w.balance, 0);

  // Lifetime paid = sum of ALL values in the weeklyPaid map (not just visible weeks)
  const lifetimePaid = useMemo(
    () => (weeklyPaid ? Array.from(weeklyPaid.values()).reduce((s, v) => s + v, 0) : 0),
    [weeklyPaid]
  );

  const contractValue = contract.totalValue ?? 0;
  // % of contract value paid; cap at 100 for display
  const contractProgress =
    contractValue > 0 ? Math.min(100, Math.round((lifetimePaid / contractValue) * 100)) : 0;
  const contractRemaining = contractValue > 0 ? Math.max(0, contractValue - lifetimePaid) : 0;

  // First unsettled non-current week (for top-right Settle button)
  const firstPendingWeek = weeks.find((w) => w.balance > 0 && !w.isCurrentWeek) ?? null;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["contract-weekly-paid", contract.id] });
    queryClient.invalidateQueries({ queryKey: ["trade-attendance-summary", contract.id] });
    queryClient.invalidateQueries({ queryKey: ["trade-reconciliations"] });
    queryClient.invalidateQueries({ queryKey: ["trade-settlement-history", contract.id, mode] });
  };

  // "By date" work-day entries — mid-entries sorted by date DESC
  const workDayEntries = useMemo(() => {
    if (mode === "mid" && midEntries) {
      return [...midEntries]
        .filter((e) => e.dayTotalAmount > 0 || e.laborerIds.length > 0 || e.note)
        .sort((a, b) => (a.attendanceDate < b.attendanceDate ? 1 : -1));
    }
    if (mode === "headcount" && headcount) {
      const rateById = new Map(headcount.rates.map((r) => [r.roleId, r.dailyRate]));
      const byDate = new Map<string, { count: number; earned: number }>();
      for (const e of headcount.recent) {
        const rate = rateById.get(e.roleId) ?? 0;
        const prev = byDate.get(e.attendanceDate) ?? { count: 0, earned: 0 };
        byDate.set(e.attendanceDate, {
          count: prev.count + e.units,
          earned: prev.earned + e.units * rate,
        });
      }
      return Array.from(byDate.entries())
        .sort(([a], [b]) => (a < b ? 1 : -1))
        .map(([date, data]) => ({ attendanceDate: date, ...data, note: null }));
    }
    return [];
  }, [mode, midEntries, headcount]);

  if (mode === "mesthri_only") {
    return (
      <Alert severity="info" sx={{ m: 2 }}>
        <strong>Mesthri-only mode</strong> — no weekly waterfall. Record one-off payments via the
        contract&apos;s 3-dot menu on /site/trades.
      </Alert>
    );
  }
  if (mode === "detailed") {
    return (
      <Alert severity="info" sx={{ m: 2 }}>
        <strong>Detailed mode</strong> — uses the same per-laborer waterfall as Civil. Switch back
        to the Civil chip to settle these.
      </Alert>
    );
  }

  const isMidMode = mode === "mid";

  return (
    <Box>
      {/* Summary band — KPI tiles + contract progress + Settle button */}
      <Paper sx={{ p: 2, mb: 2 }}>
        {/* Top row: KPI tiles + Settle button */}
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" flexWrap="wrap" gap={2} sx={{ mb: contractValue > 0 ? 2 : 0 }}>
          <Box sx={{
            display: "grid",
            gridTemplateColumns: contractValue > 0
              ? "repeat(4, auto)"
              : "repeat(3, auto)",
            gap: { xs: 2, sm: 3 },
          }}>
            {contractValue > 0 && (
              <Box sx={{ px: 2, py: 1, bgcolor: alpha(tradeColor.main, 0.06), borderRadius: 1.5, minWidth: 100 }}>
                <Typography variant="caption" color="text.secondary" component="div" sx={{ textTransform: "uppercase", letterSpacing: 0.4, fontSize: "0.67rem" }}>
                  Contract value
                </Typography>
                <Typography variant="h6" fontWeight={700} sx={{ color: tradeColor.main, fontVariantNumeric: "tabular-nums" }}>
                  ₹{formatINR(contractValue)}
                </Typography>
              </Box>
            )}
            <Box sx={{ px: 2, py: 1, bgcolor: alpha(theme.palette.success.main, 0.06), borderRadius: 1.5, minWidth: 100 }}>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ textTransform: "uppercase", letterSpacing: 0.4, fontSize: "0.67rem" }}>
                {contractValue > 0 ? "Paid (lifetime)" : "Already paid"}
              </Typography>
              <Typography variant="h6" fontWeight={700} color="success.main" sx={{ fontVariantNumeric: "tabular-nums" }}>
                ₹{formatINR(lifetimePaid)}
              </Typography>
            </Box>
            <Box sx={{ px: 2, py: 1, bgcolor: alpha(theme.palette.info.main, 0.05), borderRadius: 1.5, minWidth: 100 }}>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ textTransform: "uppercase", letterSpacing: 0.4, fontSize: "0.67rem" }}>
                Earned (period)
              </Typography>
              <Typography variant="h6" fontWeight={700} color="text.primary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                ₹{formatINR(totalEarned)}
              </Typography>
            </Box>
            <Box sx={{ px: 2, py: 1, bgcolor: totalBalance > 0 ? alpha(theme.palette.warning.main, 0.07) : alpha(theme.palette.success.main, 0.05), borderRadius: 1.5, minWidth: 100 }}>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ textTransform: "uppercase", letterSpacing: 0.4, fontSize: "0.67rem" }}>
                Pending now
              </Typography>
              <Typography variant="h6" fontWeight={700} color={totalBalance > 0 ? "warning.dark" : "success.main"} sx={{ fontVariantNumeric: "tabular-nums" }}>
                {totalBalance > 0 ? `₹${formatINR(totalBalance)}` : "All settled"}
              </Typography>
            </Box>
          </Box>

          {/* Top-right Settle button */}
          {firstPendingWeek && (
            <Button
              variant="contained"
              startIcon={<SettleIcon />}
              onClick={() => setSettleWeekStart(firstPendingWeek.weekStart)}
              sx={{
                bgcolor: tradeColor.main,
                "&:hover": { bgcolor: tradeColor.dark },
                color: tradeColor.contrastText,
                alignSelf: "center",
                whiteSpace: "nowrap",
              }}
            >
              Settle pending · ₹{formatINR(firstPendingWeek.balance)}
            </Button>
          )}
        </Stack>

        {/* Contract progress bar (only when contract has a value set) */}
        {contractValue > 0 && (
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Salary progress
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 700, color: contractProgress >= 100 ? "success.main" : "text.secondary" }}>
                {contractProgress}%
              </Typography>
            </Stack>
            <Box sx={{ height: 8, bgcolor: alpha(tradeColor.main, 0.15), borderRadius: 1, overflow: "hidden" }}>
              <Box
                sx={{
                  height: "100%",
                  width: `${contractProgress}%`,
                  bgcolor: contractProgress >= 100 ? "success.main" : tradeColor.main,
                  borderRadius: 1,
                  transition: "width 0.4s ease",
                }}
              />
            </Box>
            <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
              <Typography variant="caption" color="success.main" sx={{ fontWeight: 600 }}>
                ₹{formatINR(lifetimePaid)} paid
              </Typography>
              <Typography variant="caption" color={contractRemaining > 0 ? "warning.dark" : "success.main"} sx={{ fontWeight: 600 }}>
                {contractRemaining > 0 ? `₹${formatINR(contractRemaining)} remaining` : "Contract complete ✓"}
              </Typography>
            </Stack>
          </Box>
        )}
      </Paper>

      {/* View toggle */}
      <Box sx={{ mb: 1.5, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <ToggleButtonGroup
          size="small"
          value={viewMode}
          exclusive
          onChange={(_, v) => { if (v) setViewMode(v); }}
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
        {(viewMode === "by-settlement") && settlementItems && (
          <Typography variant="caption" color="text.secondary">
            {settlementItems.length} {settlementItems.length === 1 ? "settlement" : "settlements"}
          </Typography>
        )}
        {viewMode === "by-date" && (
          <Typography variant="caption" color="text.secondary">
            {workDayEntries.length} {workDayEntries.length === 1 ? "day" : "days"} of work
          </Typography>
        )}
      </Box>

      {/* ─── Weekly waterfall — clickable card rows, no per-row Settle button ─── */}
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
                gridTemplateColumns: "1fr 52px 90px 90px 90px",
                gap: 1,
                px: 1.75,
                py: 0.85,
                bgcolor: tradeColor.dark,
                borderRadius: 1,
              }}
            >
              {["Week", "Days", "Earned", "Paid", "Balance"].map((h) => (
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
              const hasActivity = !empty;
              return (
                <Box
                  key={week.weekStart}
                  onClick={() => hasActivity && setSelectedWeek(week)}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "1fr 52px 90px 90px 90px",
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
                    opacity: empty ? 0.5 : 1,
                    alignItems: "center",
                    cursor: hasActivity ? "pointer" : "default",
                    transition: "box-shadow 120ms, border-color 120ms",
                    ...(hasActivity && {
                      "&:hover": {
                        boxShadow: 1,
                        borderColor: alpha(tradeColor.main, 0.4),
                      },
                    }),
                  }}
                >
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      {week.weekLabel}
                    </Typography>
                    {week.isCurrentWeek && (
                      <Chip label="this week" size="small" color="info"
                        sx={{ height: 16, fontSize: "0.58rem", mt: 0.25 }} />
                    )}
                    {week.balance > 0 && !week.isCurrentWeek && (
                      <Typography variant="caption" color="warning.dark" sx={{ fontWeight: 600 }}>
                        Tap to settle ▶
                      </Typography>
                    )}
                    {fullySettled && (
                      <Typography variant="caption" color="success.main">
                        ✓ Settled — tap to view
                      </Typography>
                    )}
                  </Box>

                  <Typography variant="body2"
                    color={week.daysWithEntries > 0 ? "text.primary" : "text.disabled"}
                    sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {week.daysWithEntries || "—"}
                  </Typography>

                  <Typography variant="body2" fontWeight={600}
                    color={week.earned > 0 ? "text.primary" : "text.disabled"}
                    sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {week.earned > 0 ? `₹${formatINR(week.earned)}` : "—"}
                  </Typography>

                  <Typography variant="body2"
                    color={week.paid > 0 ? "success.main" : "text.disabled"}
                    sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {week.paid > 0 ? `₹${formatINR(week.paid)}` : "—"}
                  </Typography>

                  <Typography variant="body2"
                    fontWeight={week.balance > 0 ? 700 : 400}
                    color={week.balance > 0 ? "warning.dark" : fullySettled ? "success.main" : "text.disabled"}
                    sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {week.balance > 0
                      ? `₹${formatINR(week.balance)}`
                      : fullySettled ? "✓" : "—"}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        )
      )}

      {/* ─── By Settlement / By Date ─── */}
      {(viewMode === "by-settlement") && (
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
              Use the Settle button above to record one.
            </Typography>
          </Box>
        ) : isMidMode ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {(settlementItems as SettlementRecord[]).map((s) => (
              <SettlementCard
                key={s.id}
                s={s}
                tradeColor={tradeColor}
                onEdit={() => setEditTarget(toEditable(s))}
                onDelete={() => setDeleteTarget(s)}
              />
            ))}
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {(settlementItems as HeadcountSettlement[]).map((s) => (
              <HeadcountSettlementCard
                key={s.id}
                s={s}
                tradeColor={tradeColor}
                deleting={headcountDeletingId === s.id}
                onDelete={async () => {
                  setHeadcountDeletingId(s.id);
                  try {
                    await (supabase as any)
                      .from("subcontract_payments")
                      .update({ is_deleted: true })
                      .eq("id", s.id);
                    invalidateAll();
                  } finally { setHeadcountDeletingId(null); }
                }}
              />
            ))}
          </Box>
        )
      )}

      {/* ─── By Date — daily work entries ─── */}
      {viewMode === "by-date" && (
        isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : workDayEntries.length === 0 ? (
          <Box sx={{ py: 5, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              No attendance recorded yet for this contract.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
            {/* Header */}
            <Box sx={{
              display: "grid",
              gridTemplateColumns: "1fr 90px 90px 100px",
              gap: 1,
              px: 1.75,
              py: 0.85,
              bgcolor: tradeColor.dark,
              borderRadius: 1,
            }}>
              {["Date", "Present", "Work done", "Earned"].map((h) => (
                <Typography key={h} variant="caption"
                  sx={{ color: tradeColor.contrastText, fontWeight: 700, fontSize: "0.67rem", textTransform: "uppercase", letterSpacing: 0.4 }}>
                  {h}
                </Typography>
              ))}
            </Box>

            {workDayEntries.map((e) => {
              const isMidEntry = "dayTotalAmount" in e;
              const earned = isMidEntry ? (e as any).dayTotalAmount : (e as any).earned;
              const count = isMidEntry ? (e as any).laborerIds?.length ?? 0 : (e as any).count;
              const workDone = isMidEntry ? (e as any).workDoneUnits ?? 0 : 0;
              const note = (e as any).note;
              return (
                <Box key={e.attendanceDate} sx={{
                  display: "grid",
                  gridTemplateColumns: "1fr 90px 90px 100px",
                  gap: 1,
                  px: 1.75,
                  py: 1,
                  bgcolor: "background.paper",
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1.5,
                  alignItems: "center",
                }}>
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      {dayjs(e.attendanceDate).format("ddd, D MMM YYYY")}
                    </Typography>
                    {note && (
                      <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
                        {note}
                      </Typography>
                    )}
                  </Box>
                  <Typography variant="body2" color={count > 0 ? "text.primary" : "text.disabled"}>
                    {count > 0 ? `${count} came` : "—"}
                  </Typography>
                  <Typography variant="body2" color={workDone > 0 ? "text.primary" : "text.disabled"}>
                    {workDone > 0 ? `${workDone} day${workDone !== 1 ? "s" : ""}` : "—"}
                  </Typography>
                  <Typography variant="body2" fontWeight={700}
                    sx={{ fontVariantNumeric: "tabular-nums", color: earned > 0 ? tradeColor.main : "text.disabled" }}>
                    {earned > 0 ? `₹${formatINR(earned)}` : "—"}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        )
      )}

      {/* ─── Week Detail Dialog ─── */}
      <WeekDetailDialog
        week={selectedWeek}
        onClose={() => setSelectedWeek(null)}
        onSettle={(ws) => setSettleWeekStart(ws)}
        tradeColor={tradeColor}
        midEntries={midEntries}
        headcountEntries={headcount?.recent}
        headcountRates={headcount?.rates}
        mode={mode}
      />

      {/* ─── Settle dialog ─── */}
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
      {settleWeekStart !== null && mode === "mid" && !walletSettleOpen && (() => {
        const week = weeks.find((w) => w.weekStart === settleWeekStart);
        return (
          <MestriSettleDialog
            open={true}
            onClose={() => { setSettleWeekStart(null); invalidateAll(); }}
            siteId={contract.siteId}
            mode="fill-week"
            weekStart={settleWeekStart}
            weekEnd={week?.weekEnd}
            suggestedAmount={week?.balance ?? 0}
            initialSubcontractId={contract.id}
            onSwitchToWallet={
              isWalletEngineer ? () => setWalletSettleOpen(true) : undefined
            }
          />
        );
      })()}
      {settleWeekStart !== null && mode === "mid" && walletSettleOpen && userProfile && (() => {
        const week = weeks.find((w) => w.weekStart === settleWeekStart);
        return (
          <ContractSettleViaWallet
            open
            onClose={() => {
              setWalletSettleOpen(false);
              setSettleWeekStart(null);
            }}
            onSuccess={() => {
              setWalletSettleOpen(false);
              setSettleWeekStart(null);
              invalidateAll();
            }}
            siteId={contract.siteId}
            engineerId={userProfile.id}
            subcontractId={contract.id}
            suggestedAmount={week?.balance ?? 0}
            weekStart={settleWeekStart}
            weekEnd={week?.weekEnd}
          />
        );
      })()}

      {/* ─── Edit dialog ─── */}
      <ContractSettlementEditDialog
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        settlement={editTarget}
        onSuccess={() => { setEditTarget(null); invalidateAll(); }}
      />

      {/* ─── Delete dialog ─── */}
      <DeleteContractSettlementDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        settlement={deleteTarget}
        onSuccess={() => { setDeleteTarget(null); invalidateAll(); }}
      />
    </Box>
  );
}

// ─── Settlement card sub-components ───────────────────────────────────────────

function SettlementCard({
  s, tradeColor, onEdit, onDelete,
}: {
  s: SettlementRecord; tradeColor: TradeColor;
  onEdit: () => void; onDelete: () => void;
}) {
  const theme = useTheme();
  return (
    <Box sx={{
      px: 2, py: 1.5,
      bgcolor: "background.paper",
      border: 1, borderColor: "divider",
      borderRadius: 1.5,
      display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap",
    }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography variant="caption" sx={{
            fontFamily: "monospace", fontWeight: 700,
            bgcolor: alpha(tradeColor.main, 0.08), color: tradeColor.main,
            border: `1px solid ${alpha(tradeColor.main, 0.25)}`,
            borderRadius: 0.5, px: 0.75, py: 0.1,
          }}>
            {s.settlementReference}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {dayjs(s.settlementDate).format("DD MMM YYYY")}
          </Typography>
          {s.payerSource && <PayerBadge source={s.payerSource} name={s.payerName} />}
        </Stack>
        {s.weekAllocations && s.weekAllocations.length > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: "block" }}>
            Week: {dayjs(s.weekAllocations[0].weekStart).format("D MMM")} –{" "}
            {dayjs(s.weekAllocations[0].weekEnd).format("D MMM YYYY")}
          </Typography>
        )}
        {s.notes && (
          <Typography variant="caption" color="text.secondary"
            sx={{ mt: 0.25, display: "block", fontStyle: "italic" }}>
            {s.notes}
          </Typography>
        )}
      </Box>
      <Typography variant="body1" fontWeight={700}
        sx={{ fontVariantNumeric: "tabular-nums", color: tradeColor.main }}>
        ₹{new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(s.totalAmount)}
      </Typography>
      <Tooltip title="Edit settlement">
        <IconButton size="small" onClick={onEdit}><EditIcon fontSize="small" /></IconButton>
      </Tooltip>
      <Tooltip title="Delete settlement">
        <IconButton size="small" color="error" onClick={onDelete}>
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

function HeadcountSettlementCard({
  s, tradeColor, deleting, onDelete,
}: {
  s: HeadcountSettlement; tradeColor: TradeColor;
  deleting: boolean; onDelete: () => void;
}) {
  return (
    <Box sx={{
      px: 2, py: 1.5,
      bgcolor: "background.paper",
      border: 1, borderColor: "divider",
      borderRadius: 1.5,
      display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap",
    }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary">
          {dayjs(s.created_at).format("DD MMM YYYY")}
          {s.period_from_date && ` · Week: ${dayjs(s.period_from_date).format("D MMM")}`}
          {s.period_to_date && ` – ${dayjs(s.period_to_date).format("D MMM YYYY")}`}
        </Typography>
        {s.notes && (
          <Typography variant="caption" color="text.secondary"
            sx={{ mt: 0.25, display: "block", fontStyle: "italic" }}>
            {s.notes}
          </Typography>
        )}
      </Box>
      <Typography variant="body1" fontWeight={700}
        sx={{ fontVariantNumeric: "tabular-nums", color: tradeColor.main }}>
        ₹{new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Number(s.amount))}
      </Typography>
      <Tooltip title="Delete settlement">
        <span>
          <IconButton size="small" color="error" disabled={deleting} onClick={onDelete}>
            {deleting ? <CircularProgress size={14} color="inherit" /> : <DeleteIcon fontSize="small" />}
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}
