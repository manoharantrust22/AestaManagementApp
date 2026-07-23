"use client";

import { useState } from "react";
import { Box, Typography, Button, IconButton, Menu, MenuItem, ListItemIcon, ListItemText, Paper, Chip } from "@mui/material";
import ArrowBack from "@mui/icons-material/ArrowBack";
import MoreVert from "@mui/icons-material/MoreVert";
import EditOutlined from "@mui/icons-material/EditOutlined";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import Replay from "@mui/icons-material/Replay";
import dayjs from "dayjs";
import {
  TASK_WORK_STATUS_LABEL,
  type TaskWorkPackageWithMeta,
} from "@/types/taskWork.types";
import { useTaskWorkProfitability } from "@/hooks/queries/useTaskWorkProfitability";
import { useContractLaborLedger } from "@/hooks/queries/useContractLaborLedger";
import { useTaskWorkDayLogs } from "@/hooks/queries/useTaskWorkDayLogs";
import { useTaskWorkVariations } from "@/hooks/queries/useTaskWorkVariations";
import { useUpdateTaskWorkPackage } from "@/hooks/queries/useTaskWorkPackages";
import { sumDayLogValue } from "@/lib/taskWork/dayLogCost";
import { computeCostStatus, type CostVerdict } from "@/lib/taskWork/costStatus";
import {
  buildCompletionUpdate,
  buildReopenUpdate,
  type CompletionChoice,
} from "@/lib/taskWork/completion";
import TaskWorkEffortPanel from "@/components/task-work/TaskWorkEffortPanel";
import ContractLaborLedger from "@/components/workforce/ContractLaborLedger";
import TaskWorkPaymentsPanel from "@/components/task-work/TaskWorkPaymentsPanel";
import TaskWorkPaymentDialog from "@/components/task-work/TaskWorkPaymentDialog";
import TaskWorkVariationsSection from "@/components/task-work/TaskWorkVariationsSection";
import TaskWorkCompleteDialog from "@/components/task-work/TaskWorkCompleteDialog";
import { wsColors, wsRadius, wsShadow } from "@/lib/workforce/workspaceTokens";
import { formatCurrencyFull } from "@/lib/formatters";
import { StatCard } from "./StatCard";

const STATUS_PILL: Record<string, { color: string; bg: string }> = {
  active: { color: wsColors.green, bg: wsColors.greenBg },
  completed: { color: wsColors.primary, bg: wsColors.primaryTint },
  draft: { color: wsColors.muted, bg: "#f0f2f6" },
  on_hold: { color: wsColors.amber, bg: wsColors.amberBg },
  cancelled: { color: wsColors.red, bg: wsColors.redBg },
};

// Verdict colour for the compact "money vs work" strip (mirrors the legacy drawer).
const VERDICT_META: Record<CostVerdict, { label: string; color: string; bg: string }> = {
  ahead: { label: "Paid ahead", color: wsColors.amber, bg: wsColors.amberBg },
  behind: { label: "Behind work", color: wsColors.primary, bg: wsColors.primaryTint },
  fair: { label: "On track", color: wsColors.green, bg: wsColors.greenBg },
  unknown: { label: "No work value yet", color: wsColors.muted, bg: "#f0f2f6" },
};

/**
 * Fixed-price package, rendered in the SAME detail pane as Contracts / Sections /
 * Tasks (no more floating drawer). Reuses the standalone task-work panels for the
 * day log, payments and extras, plus the package's complete / reopen / edit actions.
 */
export function PackageDetailPane({
  pkg,
  canEdit,
  onEdit,
  showBack = false,
  onBack,
}: {
  pkg: TaskWorkPackageWithMeta;
  canEdit: boolean;
  /** Opens the package edit dialog (owned by the page). */
  onEdit: (pkg: TaskWorkPackageWithMeta) => void;
  showBack?: boolean;
  onBack?: () => void;
}) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  // "Record payment" starts blank; the completion flow's "pay the balance first"
  // opens the same dialog pre-filled to the full balance.
  const [paySettle, setPaySettle] = useState(false);
  const { data: prof } = useTaskWorkProfitability(pkg.id);
  const { data: dayLogs = [] } = useTaskWorkDayLogs(pkg.id);
  const { data: variations = [] } = useTaskWorkVariations(pkg.id);
  const updateMut = useUpdateTaskWorkPackage();

  // Direct-pay mode: the money frame is per-laborer settlement, not the fixed price.
  const directMode = Boolean(pkg.mesthri_commission_enabled);
  const { data: ledger } = useContractLaborLedger(
    "task_work",
    pkg.id,
    null,
    null,
    directMode,
  );
  const crewPaid = ledger?.totalNetPaid ?? 0;
  const crewOwed = ledger?.totalNetUnpaid ?? 0;
  const crewTotal = ledger?.totalNet ?? 0;

  // `paid` = money paid FOR this package (lump payments + crew settlements).
  // `wagesPrepaid` = daily wages already settled on days that were later pulled onto
  // this package — the crew already has that money for this work, so it counts
  // against the price rather than being paid a second time. Derived in
  // v_task_work_profitability, so it disappears again if the days are un-pulled.
  const paid = prof?.paid ?? pkg.paid ?? 0;
  const wagesPrepaid = prof?.wages_prepaid ?? 0;
  const totalPaid = prof?.total_paid ?? paid + wagesPrepaid;
  const baseAgreed = pkg.total_value || 0;
  const balanceDue = prof?.balance ?? baseAgreed - totalPaid;
  const isClosed = pkg.status === "completed" || pkg.status === "cancelled";
  const paidPct = baseAgreed > 0 ? Math.round((totalPaid / baseAgreed) * 100) : 0;

  // Money vs work — agreed (incl. approved extras) against logged work value & paid.
  const approvedExtras = variations
    .filter((v) => v.status === "approved")
    .reduce((s, v) => s + Number(v.amount || 0), 0);
  const effectiveAgreed = baseAgreed + approvedExtras;
  const workValue = sumDayLogValue(dayLogs);
  // Uses totalPaid: money that reached the crew as wages is just as spent as money
  // paid to the maistry, so "paid ahead of / behind the work logged" must see both.
  const costStatus = computeCostStatus({ effectiveAgreed, workValue, paid: totalPaid });
  const verdict = VERDICT_META[costStatus.verdict];

  const pill = STATUS_PILL[pkg.status] ?? STATUS_PILL.active;

  const handleCompleteConfirm = (choice: CompletionChoice, reason: string) => {
    updateMut.mutate(
      {
        id: pkg.id,
        siteId: pkg.site_id,
        data: buildCompletionUpdate({
          choice,
          reason,
          actualEndDate: pkg.actual_end_date,
          today: dayjs().format("YYYY-MM-DD"),
        }),
      },
      { onSuccess: () => setCompleteOpen(false) }
    );
  };

  const handleReopen = () =>
    updateMut.mutate({ id: pkg.id, siteId: pkg.site_id, data: buildReopenUpdate() });

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", bgcolor: wsColors.canvas, minWidth: 0 }}>
      {/* Header */}
      <Box
        sx={{
          bgcolor: wsColors.surface,
          borderBottom: `1px solid ${wsColors.hairline}`,
          px: 2,
          py: 1.25,
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        {showBack && (
          <IconButton size="small" onClick={onBack} sx={{ ml: -0.5 }}>
            <ArrowBack sx={{ fontSize: 20 }} />
          </IconButton>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 600, color: wsColors.muted }} noWrap>
            {pkg.category_name ?? "Task work"}
            {pkg.parent_subcontract_title ? ` › ${pkg.parent_subcontract_title}` : ""} › Fixed-price
            package
          </Typography>
          <Typography sx={{ fontSize: 16.5, fontWeight: 800, color: wsColors.ink, letterSpacing: "-.02em" }} noWrap>
            {pkg.title}
          </Typography>
        </Box>
        {canEdit && (
          <>
            <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)} title="More">
              <MoreVert sx={{ fontSize: 18, color: wsColors.muted }} />
            </IconButton>
            <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
              <MenuItem
                onClick={() => {
                  setMenuAnchor(null);
                  onEdit(pkg);
                }}
              >
                <ListItemIcon>
                  <EditOutlined fontSize="small" />
                </ListItemIcon>
                <ListItemText primaryTypographyProps={{ fontSize: 14 }}>Edit package</ListItemText>
              </MenuItem>
              {!isClosed && (
                <MenuItem
                  onClick={() => {
                    setMenuAnchor(null);
                    setCompleteOpen(true);
                  }}
                >
                  <ListItemIcon>
                    <CheckCircleRounded fontSize="small" sx={{ color: wsColors.green }} />
                  </ListItemIcon>
                  <ListItemText primaryTypographyProps={{ fontSize: 14 }}>Mark as completed</ListItemText>
                </MenuItem>
              )}
              {isClosed && (
                <MenuItem
                  disabled={updateMut.isPending}
                  onClick={() => {
                    setMenuAnchor(null);
                    handleReopen();
                  }}
                >
                  <ListItemIcon>
                    <Replay fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primaryTypographyProps={{ fontSize: 14 }}>Reopen</ListItemText>
                </MenuItem>
              )}
            </Menu>
          </>
        )}
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1, overflowY: "auto", p: 2, display: "flex", flexDirection: "column", gap: 1.75 }}>
        {/* Identity row */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 800, color: wsColors.ink }} noWrap>
              {pkg.maistry_name ?? "—"}
            </Typography>
            <Typography sx={{ fontSize: 12.5, color: wsColors.muted }} noWrap>
              {directMode ? "Pay laborers directly" : "Fixed price"} · {pkg.package_number}
            </Typography>
          </Box>
          <Box sx={{ px: 1.1, py: 0.4, borderRadius: 999, bgcolor: pill.bg, color: pill.color, fontSize: 11.5, fontWeight: 800 }}>
            {TASK_WORK_STATUS_LABEL[pkg.status]}
          </Box>
        </Box>

        {/* Stat cards — lump mode tracks the fixed price; direct mode tracks crew wages. */}
        {directMode ? (
          <Box sx={{ display: "flex", gap: 1 }}>
            <StatCard label="Agreed price" value={formatCurrencyFull(baseAgreed)} sub="reference" />
            <StatCard label="Paid to crew" value={formatCurrencyFull(crewPaid)} valueColor={wsColors.green} />
            <StatCard
              label="Owed to crew"
              value={formatCurrencyFull(crewOwed)}
              valueColor={crewOwed > 0 ? wsColors.red : undefined}
            />
          </Box>
        ) : (
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <StatCard label="Agreed price" value={formatCurrencyFull(baseAgreed)} />
            <StatCard
              label="Paid out"
              value={formatCurrencyFull(paid)}
              valueColor={wsColors.primary}
              sub={`${paidPct}% of price`}
            />
            {/* Shown only when it exists, so packages that never had wage days keep
                the familiar three-card row. */}
            {wagesPrepaid > 0 && (
              <StatCard
                label="Wages already paid"
                value={formatCurrencyFull(wagesPrepaid)}
                valueColor={wsColors.green}
                sub="counts toward price"
              />
            )}
            <StatCard
              label={balanceDue >= 0 ? "Balance" : "Overpaid"}
              value={formatCurrencyFull(Math.abs(balanceDue))}
              valueColor={balanceDue > 0 ? wsColors.red : undefined}
            />
          </Box>
        )}

        {directMode ? (
          /* Direct mode — labour settlement progress (the fixed price is just a benchmark). */
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1,
              px: 1.5,
              py: 1.1,
              borderRadius: `${wsRadius.input}px`,
              bgcolor: crewOwed > 0 ? wsColors.amberBg : wsColors.greenBg,
              border: `1px solid ${(crewOwed > 0 ? wsColors.amber : wsColors.green)}33`,
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: crewOwed > 0 ? wsColors.amber : wsColors.green }} noWrap>
                {crewOwed > 0
                  ? `Labour settled ${formatCurrencyFull(crewPaid)} of ${formatCurrencyFull(crewTotal)}`
                  : crewTotal > 0
                    ? "All crew wages settled"
                    : "No crew days logged yet"}
              </Typography>
              <Typography sx={{ fontSize: 11, color: wsColors.muted }} noWrap>
                Pay each laborer their net + the maistry his commission from the crew ledger below.
              </Typography>
            </Box>
            <Chip
              size="small"
              label={crewOwed > 0 ? `${formatCurrencyFull(crewOwed)} owed` : "Settled"}
              sx={{ bgcolor: "#fff", color: crewOwed > 0 ? wsColors.amber : wsColors.green, fontWeight: 700, flexShrink: 0 }}
            />
          </Box>
        ) : (
          /* Money vs work — agreed (incl. approved extras) vs logged work value vs paid. */
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1,
              px: 1.5,
              py: 1.1,
              borderRadius: `${wsRadius.input}px`,
              bgcolor: verdict.bg,
              border: `1px solid ${verdict.color}33`,
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: verdict.color }} noWrap>
                {costStatus.verdict === "ahead"
                  ? `Paid ${formatCurrencyFull(Math.abs(costStatus.paidVsWork))} ahead of work logged`
                  : costStatus.verdict === "behind"
                    ? `Paid ${formatCurrencyFull(Math.abs(costStatus.paidVsWork))} behind work logged`
                    : costStatus.verdict === "fair"
                      ? "Payments track the work logged"
                      : "Log days to compare paid vs work done"}
              </Typography>
              {approvedExtras > 0 && (
                <Typography sx={{ fontSize: 11, color: wsColors.muted }} noWrap>
                  Effective agreed {formatCurrencyFull(effectiveAgreed)} (incl. {formatCurrencyFull(approvedExtras)} extras)
                </Typography>
              )}
            </Box>
            <Chip size="small" label={verdict.label} sx={{ bgcolor: "#fff", color: verdict.color, fontWeight: 700, flexShrink: 0 }} />
          </Box>
        )}

        {/* Company saving (locked) once actuals are logged AND a daywork benchmark
            exists — without an estimate the saving reads as a misleading -price. */}
        {prof && prof.actual_man_days > 0 && prof.daywage_benchmark_cost > 0 && (
          <Paper
            variant="outlined"
            sx={{ p: 1.25, borderRadius: `${wsRadius.card}px`, borderColor: prof.company_saving >= 0 ? "#cdebd6" : wsColors.amber, boxShadow: wsShadow.card }}
          >
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <Typography sx={{ fontSize: 12.5, color: wsColors.muted }}>
                Company saving vs daywork ({prof.actual_man_days} man-days)
              </Typography>
              <Typography sx={{ fontSize: 15, fontWeight: 800, color: prof.company_saving >= 0 ? wsColors.green : wsColors.amber }}>
                {formatCurrencyFull(prof.company_saving)}
                {prof.saving_pct != null ? ` (${prof.saving_pct}%)` : ""}
              </Typography>
            </Box>
          </Paper>
        )}

        {/* Completed banner */}
        {pkg.status === "completed" && (
          <Paper variant="outlined" sx={{ p: 1.25, borderRadius: `${wsRadius.card}px`, borderColor: "#cdebd6" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CheckCircleRounded sx={{ fontSize: 18, color: wsColors.green }} />
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: wsColors.ink }}>
                Completed{pkg.actual_end_date ? ` on ${dayjs(pkg.actual_end_date).format("DD MMM YYYY")}` : ""} · {formatCurrencyFull(totalPaid)} paid
              </Typography>
            </Box>
            {balanceDue > 0 && (
              <Typography sx={{ fontSize: 11.5, color: wsColors.muted, mt: 0.5 }}>
                {pkg.balance_waived ? `Waived ${formatCurrencyFull(balanceDue)}` : `${formatCurrencyFull(balanceDue)} still owed`}
                {pkg.completion_reason ? ` · ${pkg.completion_reason}` : ""}
              </Typography>
            )}
          </Paper>
        )}

        {pkg.scope_of_work && (
          <Box sx={{ px: 0.25 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: wsColors.muted, textTransform: "uppercase", letterSpacing: ".04em" }}>
              Scope of work
            </Typography>
            <Typography sx={{ fontSize: 13, color: wsColors.ink2, whiteSpace: "pre-wrap" }}>{pkg.scope_of_work}</Typography>
          </Box>
        )}

        {/* Reused task-work surfaces — extras, day log, payments (with Pay / Settle). */}
        <SectionTitle>Extras &amp; variations</SectionTitle>
        <TaskWorkVariationsSection packageId={pkg.id} siteId={pkg.site_id} canEdit={canEdit} />

        <SectionTitle>Day log</SectionTitle>
        <TaskWorkEffortPanel
          packageId={pkg.id}
          siteId={pkg.site_id}
          laborCategoryId={pkg.labor_category_id}
          canEdit={canEdit}
          packageTitle={pkg.title}
          totalValue={baseAgreed}
          alreadyPaid={paid}
          startDateHint={pkg.actual_start_date ?? pkg.planned_start_date}
        />

        <SectionTitle>Crew earnings &amp; commission</SectionTitle>
        <ContractLaborLedger
          kind="task_work"
          refId={pkg.id}
          commissionEnabled={Boolean(pkg.mesthri_commission_enabled)}
          commissionApplies={pkg.mesthri_commission_applies ?? true}
          onEnableCommission={canEdit ? () => onEdit(pkg) : undefined}
          siteId={pkg.site_id}
          mesthriLaborerId={pkg.maistry_laborer_id}
          mesthriName={pkg.maistry_name}
        />

        <SectionTitle>Payments</SectionTitle>
        <TaskWorkPaymentsPanel
          pkg={pkg}
          canEdit={canEdit}
          onRecordPayment={() => {
            setPaySettle(false);
            setPayOpen(true);
          }}
          onMarkComplete={!isClosed ? () => setCompleteOpen(true) : undefined}
        />
      </Box>

      <TaskWorkCompleteDialog
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        title={pkg.title}
        balanceDue={balanceDue}
        isPending={updateMut.isPending}
        onSettle={() => {
          setCompleteOpen(false);
          setPaySettle(true);
          setPayOpen(true);
        }}
        onConfirm={handleCompleteConfirm}
      />

      <TaskWorkPaymentDialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        pkg={pkg}
        balanceDue={balanceDue}
        defaultType={paySettle ? "final_settlement" : "advance"}
      />
    </Box>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{ fontSize: 11, fontWeight: 700, color: wsColors.muted, textTransform: "uppercase", letterSpacing: ".04em", mt: 0.5 }}>
      {children}
    </Typography>
  );
}
