"use client";

import type { ReactNode } from "react";
import { Box, Typography, Button, IconButton } from "@mui/material";
import ArrowBack from "@mui/icons-material/ArrowBack";
import TuneRounded from "@mui/icons-material/TuneRounded";
import PaymentsRounded from "@mui/icons-material/PaymentsRounded";
import HowToReg from "@mui/icons-material/HowToReg";
import OpenInNew from "@mui/icons-material/OpenInNew";
import GroupWork from "@mui/icons-material/GroupWork";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import RequestQuoteRounded from "@mui/icons-material/RequestQuoteRounded";
import type { WorkspaceTask } from "@/lib/workforce/workspaceModel";
import type { ContractStatus } from "@/types/trade.types";
import { modeMeta, wsColors, wsRadius, wsShadow } from "@/lib/workforce/workspaceTokens";
import { formatCurrencyFull } from "@/lib/formatters";
import { BalanceMeter } from "./BalanceMeter";
import { StatCard } from "./StatCard";
import { GoodDealCard } from "./GoodDealCard";
import { PaymentsHistoryCard } from "./PaymentsHistoryCard";

const STATUS_PILL: Record<ContractStatus, { label: string; color: string; bg: string }> = {
  active: { label: "Active", color: wsColors.green, bg: wsColors.greenBg },
  completed: { label: "Completed", color: wsColors.primary, bg: wsColors.primaryTint },
  draft: { label: "Draft", color: wsColors.muted, bg: "#f0f2f6" },
  on_hold: { label: "On hold", color: wsColors.amber, bg: wsColors.amberBg },
  cancelled: { label: "Cancelled", color: wsColors.red, bg: wsColors.redBg },
};

export function TaskDetailPane({
  task,
  onUpdateProgress,
  onRecordPayment,
  onLogAttendance,
  onSettleSalary,
  onChangeMode,
  onOpenInDetails,
  canEdit,
  showBack = false,
  onBack,
}: {
  task: WorkspaceTask | null;
  onUpdateProgress: () => void;
  onRecordPayment: () => void;
  onLogAttendance: () => void;
  onSettleSalary: () => void;
  /** Opens the tracking-mode dialog (the per-trade Attendance+Salary opt-in). */
  onChangeMode?: () => void;
  onOpenInDetails?: () => void;
  canEdit: boolean;
  showBack?: boolean;
  onBack?: () => void;
}) {
  if (!task) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 1.5,
          color: wsColors.muted,
          px: 3,
          textAlign: "center",
        }}
      >
        <GroupWork sx={{ fontSize: 44, color: wsColors.hairline }} />
        <Typography sx={{ fontSize: 15, fontWeight: 700, color: wsColors.ink2 }}>
          Select a task work
        </Typography>
        <Typography sx={{ fontSize: 13, color: wsColors.muted, maxWidth: 280 }}>
          Pick any task work from the list to see who&apos;s doing it, what&apos;s been paid, and whether
          you&apos;re paid ahead of the work.
        </Typography>
      </Box>
    );
  }

  const pill = STATUS_PILL[task.status];
  const ModeIcon = modeMeta[task.mode].icon;
  const paidPctOfValue = task.quoted > 0 ? Math.round((task.paid / task.quoted) * 100) : 0;

  // "Tracked workspace" = this contract records daily attendance and settles
  // salary (any mode except mesthri-only, which is lump payments only). This is
  // the per-trade opt-in surfaced below; onChangeMode flips it on/off.
  const tracked = task.mode !== "mesthri_only";
  const canChangeMode = canEdit && !!onChangeMode && !!task.tradeCategoryId;

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
            {task.tradeName} › {task.stageName ?? "No stage"}
          </Typography>
          <Typography sx={{ fontSize: 16.5, fontWeight: 800, color: wsColors.ink, letterSpacing: "-.02em" }} noWrap>
            {task.title}
          </Typography>
        </Box>
        {canEdit && (
          <Box sx={{ display: { xs: "none", sm: "flex" }, gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<TuneRounded />}
              onClick={onUpdateProgress}
              sx={{
                textTransform: "none",
                fontWeight: 700,
                borderRadius: `${wsRadius.input}px`,
                borderColor: wsColors.hairline,
                color: wsColors.ink2,
              }}
            >
              Update progress
            </Button>
            <Button
              variant="contained"
              startIcon={<PaymentsRounded />}
              onClick={onRecordPayment}
              disableElevation
              sx={{
                textTransform: "none",
                fontWeight: 700,
                borderRadius: `${wsRadius.input}px`,
                bgcolor: wsColors.primary,
                boxShadow: wsShadow.raised,
                "&:hover": { bgcolor: "#2a60d6" },
              }}
            >
              Record payment
            </Button>
          </Box>
        )}
        {onOpenInDetails && (
          <IconButton size="small" onClick={onOpenInDetails} title="Open in Contract details">
            <OpenInNew sx={{ fontSize: 18, color: wsColors.muted }} />
          </IconButton>
        )}
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1, overflowY: "auto", p: 2, display: "flex", flexDirection: "column", gap: 1.75 }}>
        {/* Identity row */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <Box
            sx={{
              width: 46,
              height: 46,
              borderRadius: `${wsRadius.avatar}px`,
              bgcolor: "#dfe7f6",
              color: wsColors.primary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            {task.initials}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 800, color: wsColors.ink }} noWrap>
              {task.who}
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: wsColors.muted }}>
              <Typography sx={{ fontSize: 12.5 }}>{task.party}</Typography>
              <Box sx={{ width: 3, height: 3, borderRadius: "50%", bgcolor: wsColors.muted2 }} />
              <ModeIcon sx={{ fontSize: 15 }} />
              <Typography sx={{ fontSize: 12.5 }}>{modeMeta[task.mode].short}</Typography>
            </Box>
          </Box>
          <Box
            sx={{
              px: 1.1,
              py: 0.4,
              borderRadius: 999,
              bgcolor: pill.bg,
              color: pill.color,
              fontSize: 11.5,
              fontWeight: 800,
            }}
          >
            {pill.label}
          </Box>
        </Box>

        {/* Tracked-workspace opt-in: does this contract record Attendance + Salary? */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 1.25,
            py: 0.85,
            borderRadius: `${wsRadius.input}px`,
            bgcolor: tracked ? wsColors.greenBg : "#f0f2f6",
            border: `1px solid ${tracked ? "#cdebd6" : wsColors.hairline}`,
          }}
        >
          {tracked ? (
            <CheckCircleRounded sx={{ fontSize: 18, color: wsColors.green }} />
          ) : (
            <RequestQuoteRounded sx={{ fontSize: 18, color: wsColors.muted }} />
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: tracked ? "#1f7a44" : wsColors.ink2 }} noWrap>
              {tracked ? "Tracked · Attendance + Salary" : "Lump only — not tracked"}
            </Typography>
            <Typography sx={{ fontSize: 11, color: wsColors.muted }} noWrap>
              {tracked
                ? "Daily attendance and salary are recorded for this contract."
                : "Payments only — no attendance or salary workspace."}
            </Typography>
          </Box>
          {canChangeMode && (
            <Button
              size="small"
              onClick={onChangeMode}
              sx={{ textTransform: "none", fontWeight: 700, color: wsColors.primary, minWidth: 0, flexShrink: 0 }}
            >
              {tracked ? "Change" : "Turn on"}
            </Button>
          )}
        </Box>

        {/* Stat cards */}
        <Box sx={{ display: "flex", gap: 1 }}>
          <StatCard label="Contract value" value={formatCurrencyFull(task.quoted)} />
          <StatCard
            label="Work done"
            value={formatCurrencyFull(task.exposure.workValue ?? 0)}
            sub={task.workPercent == null ? "Not tracked" : `${task.workPercent}% complete`}
          />
          <StatCard
            label="Paid out"
            value={formatCurrencyFull(task.paid)}
            valueColor={wsColors.primary}
            sub={`${paidPctOfValue}% of value`}
          />
        </Box>

        {/* Hero balance meter */}
        <BalanceMeter exposure={task.exposure} />

        {/* Bottom row */}
        <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 1.5 }}>
          <PaymentsHistoryCard contractId={task.id} />
          <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1.5 }}>
            <GoodDealCard contractId={task.id} quoted={task.quoted} />
            {/* Attendance + Salary live only on tracked contracts; a lump
                (mesthri-only) contract has no workspace — pay it via Record
                payment in the header instead. */}
            {tracked && (
              <>
                <ActionTile
                  icon={<HowToReg sx={{ fontSize: 19, color: wsColors.primary }} />}
                  label="Log attendance"
                  sub={
                    task.days > 0
                      ? `${task.days} day${task.days === 1 ? "" : "s"} recorded`
                      : "No days recorded yet"
                  }
                  onClick={onLogAttendance}
                  enabled={canEdit}
                />
                <ActionTile
                  icon={<PaymentsRounded sx={{ fontSize: 19, color: wsColors.primary }} />}
                  label="Settle salary"
                  sub="Open this contract's salary settlement"
                  onClick={onSettleSalary}
                  enabled={canEdit}
                />
              </>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

/** A clickable card linking out to a contract-scoped screen (attendance / salary). */
function ActionTile({
  icon,
  label,
  sub,
  onClick,
  enabled,
}: {
  icon: ReactNode;
  label: string;
  sub: string;
  onClick: () => void;
  enabled: boolean;
}) {
  return (
    <Box
      onClick={enabled ? onClick : undefined}
      sx={{
        bgcolor: wsColors.surface,
        border: `1px solid ${wsColors.hairline}`,
        borderRadius: `${wsRadius.card}px`,
        boxShadow: wsShadow.card,
        p: 1.75,
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        cursor: enabled ? "pointer" : "default",
        "&:hover": enabled ? { borderColor: "#d3e0fb", bgcolor: wsColors.primaryTint } : undefined,
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: `${wsRadius.input}px`,
          bgcolor: wsColors.primaryTint,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: wsColors.ink }}>{label}</Typography>
        <Typography sx={{ fontSize: 12, color: wsColors.muted }}>{sub}</Typography>
      </Box>
    </Box>
  );
}
