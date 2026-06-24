"use client";

import { useState } from "react";
import {
  Box,
  Typography,
  Button,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import ArrowBack from "@mui/icons-material/ArrowBack";
import PaymentsRounded from "@mui/icons-material/PaymentsRounded";
import Groups from "@mui/icons-material/Groups";
import OpenInNew from "@mui/icons-material/OpenInNew";
import AccountTreeRounded from "@mui/icons-material/AccountTreeRounded";
import CheckCircleRounded from "@mui/icons-material/CheckCircleRounded";
import RequestQuoteRounded from "@mui/icons-material/RequestQuoteRounded";
import MoreVert from "@mui/icons-material/MoreVert";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import type { ContractTier, WorkspaceTask } from "@/lib/workforce/workspaceModel";
import type { ContractStatus } from "@/types/trade.types";
import { modeMeta, tierMeta, wsColors, wsRadius, wsShadow } from "@/lib/workforce/workspaceTokens";
import { formatCurrencyFull } from "@/lib/formatters";
import { BalanceMeter } from "./BalanceMeter";
import { StatCard } from "./StatCard";
import { PaidSourceBreakdown } from "./GroupDetailPane";
import { GoodDealCard } from "./GoodDealCard";
import { PaymentsHistoryCard } from "./PaymentsHistoryCard";
import { ScopeSheetPanel } from "./ScopeSheetPanel";

const STATUS_PILL: Record<ContractStatus, { label: string; color: string; bg: string }> = {
  active: { label: "Active", color: wsColors.green, bg: wsColors.greenBg },
  completed: { label: "Completed", color: wsColors.primary, bg: wsColors.primaryTint },
  draft: { label: "Draft", color: wsColors.muted, bg: "#f0f2f6" },
  on_hold: { label: "On hold", color: wsColors.amber, bg: wsColors.amberBg },
  cancelled: { label: "Cancelled", color: wsColors.red, bg: wsColors.redBg },
};

/** Teaching legend for the empty pane — explains the Contract ▸ Section ▸ Task ladder. */
const TIER_LEGEND: Array<{ tier: ContractTier; desc: string }> = [
  { tier: "contract", desc: "The whole deal with one contractor — e.g. Jithin's civil contract." },
  { tier: "section", desc: "A floor or scope inside it, usually priced by square feet — e.g. Ground Floor, or external plastering across all floors." },
  { tier: "task", desc: "A single job you hand a labourer at a cost — e.g. footing grid." },
];

export function TaskDetailPane({
  task,
  onRecord,
  onChangeMode,
  onEdit,
  onDelete,
  onOpenInDetails,
  canEdit,
  showBack = false,
  onBack,
}: {
  task: WorkspaceTask | null;
  /** Opens the unified "Record" drawer (payment / progress / count / attendance / settle). */
  onRecord: () => void;
  /** Opens the tracking-mode dialog (the per-trade Attendance+Salary opt-in). */
  onChangeMode?: () => void;
  /** Opens the edit-contract dialog. */
  onEdit?: () => void;
  /** Opens the guarded delete dialog. */
  onDelete?: () => void;
  onOpenInDetails?: () => void;
  canEdit: boolean;
  showBack?: boolean;
  onBack?: () => void;
}) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  if (!task) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          px: 3,
          py: 4,
        }}
      >
        <AccountTreeRounded sx={{ fontSize: 40, color: wsColors.hairline }} />
        <Box sx={{ textAlign: "center" }}>
          <Typography sx={{ fontSize: 15, fontWeight: 800, color: wsColors.ink }}>
            How a contract is organised
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: wsColors.muted, mt: 0.25, maxWidth: 320 }}>
            Three levels, from the whole deal down to a single labourer&apos;s job.
          </Typography>
        </Box>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, maxWidth: 380, width: "100%" }}>
          {TIER_LEGEND.map(({ tier, desc }, i) => {
            const m = tierMeta[tier];
            const Icon = m.icon;
            return (
              <Box
                key={tier}
                sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 1.25,
                  // Indent each level so the hierarchy is visible at a glance.
                  ml: i * 2,
                  px: 1.25,
                  py: 1,
                  borderRadius: `${wsRadius.input}px`,
                  bgcolor: wsColors.surface,
                  border: `1px solid ${wsColors.hairline}`,
                }}
              >
                <Icon sx={{ fontSize: 20, color: m.color, mt: 0.1, flexShrink: 0 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: wsColors.ink }}>
                    {m.label}
                  </Typography>
                  <Typography sx={{ fontSize: 11.5, color: wsColors.muted, lineHeight: 1.35 }}>
                    {desc}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
        <Typography sx={{ fontSize: 11.5, color: wsColors.muted, textAlign: "center", maxWidth: 320 }}>
          Tap a row to open it. Use <strong>+ Add a section / task</strong> on any row to add the next
          level down.
        </Typography>
      </Box>
    );
  }

  const pill = STATUS_PILL[task.status];
  const ModeIcon = modeMeta[task.mode].icon;
  const paidPctOfValue = task.quoted > 0 ? Math.round((task.paid / task.quoted) * 100) : 0;

  const canChangeMode = canEdit && !!onChangeMode && !!task.tradeCategoryId;

  // Mode banner: full workspace (green) / count-by-role (blue) / lump (grey).
  const wsBanner =
    task.mode === "detailed"
      ? {
          bg: wsColors.greenBg,
          border: "#cdebd6",
          icon: <CheckCircleRounded sx={{ fontSize: 18, color: wsColors.green }} />,
          titleColor: "#1f7a44",
          title: "Full workspace · Attendance + Salary",
          sub: "Daily attendance and salary are recorded for this contract.",
        }
      : task.mode === "headcount"
        ? {
            bg: wsColors.primaryTint,
            border: "#d3e0fb",
            icon: <Groups sx={{ fontSize: 18, color: wsColors.primary }} />,
            titleColor: wsColors.primary,
            title: "Count labourers by role",
            sub: "Log the daily role counts below — no full attendance/salary.",
          }
        : {
            bg: "#f0f2f6",
            border: wsColors.hairline,
            icon: <RequestQuoteRounded sx={{ fontSize: 18, color: wsColors.muted }} />,
            titleColor: wsColors.ink2,
            title: "Just payments — not tracked",
            sub: "Payments only — no attendance or salary workspace.",
          };

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
            {task.tradeName}
          </Typography>
          <Typography sx={{ fontSize: 16.5, fontWeight: 800, color: wsColors.ink, letterSpacing: "-.02em" }} noWrap>
            {task.title}
          </Typography>
        </Box>
        {canEdit && (
          <Box sx={{ display: { xs: "none", sm: "flex" }, gap: 1 }}>
            <Button
              variant="contained"
              startIcon={<PaymentsRounded />}
              onClick={onRecord}
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
              Record
            </Button>
          </Box>
        )}
        {onOpenInDetails && (
          <IconButton size="small" onClick={onOpenInDetails} title="Open in Contract details">
            <OpenInNew sx={{ fontSize: 18, color: wsColors.muted }} />
          </IconButton>
        )}
        {canEdit && (onEdit || onDelete) && (
          <>
            <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)} title="More">
              <MoreVert sx={{ fontSize: 18, color: wsColors.muted }} />
            </IconButton>
            <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
              {onEdit && (
                <MenuItem
                  onClick={() => {
                    setMenuAnchor(null);
                    onEdit();
                  }}
                >
                  <ListItemIcon>
                    <EditOutlined fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primaryTypographyProps={{ fontSize: 14 }}>Edit details</ListItemText>
                </MenuItem>
              )}
              {onDelete && (
                <MenuItem
                  onClick={() => {
                    setMenuAnchor(null);
                    onDelete();
                  }}
                >
                  <ListItemIcon>
                    <DeleteOutline fontSize="small" sx={{ color: wsColors.red }} />
                  </ListItemIcon>
                  <ListItemText primaryTypographyProps={{ fontSize: 14, color: wsColors.red }}>
                    Delete contract
                  </ListItemText>
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

        {/* Mode banner: how this contract is handled (Full workspace / Count by role / Just payments). */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 1.25,
            py: 0.85,
            borderRadius: `${wsRadius.input}px`,
            bgcolor: wsBanner.bg,
            border: `1px solid ${wsBanner.border}`,
          }}
        >
          {wsBanner.icon}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: wsBanner.titleColor }} noWrap>
              {wsBanner.title}
            </Typography>
            <Typography sx={{ fontSize: 11, color: wsColors.muted }} noWrap>
              {wsBanner.sub}
            </Typography>
          </Box>
          {canChangeMode && (
            <Button
              size="small"
              onClick={onChangeMode}
              sx={{ textTransform: "none", fontWeight: 700, color: wsColors.primary, minWidth: 0, flexShrink: 0 }}
            >
              Change
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

        {/* Where the paid-out money came from (Workspace settlements vs fixed-price). */}
        <PaidSourceBreakdown
          split={{
            workspace: task.paidWorkspace,
            sections: task.paidFixed,
            taskWork: 0,
            total: task.paidWorkspace + task.paidFixed,
          }}
        />

        {/* Plain balance: what's still owed (agreed − paid). */}
        {(() => {
          const remaining = task.quoted - task.paid;
          const overpaid = remaining < 0;
          return (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
                px: 1.75,
                py: 1.25,
                borderRadius: `${wsRadius.card}px`,
                bgcolor: wsColors.surface,
                border: `1px solid ${wsColors.hairline}`,
                boxShadow: wsShadow.card,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: ".04em",
                    textTransform: "uppercase",
                    color: wsColors.muted,
                  }}
                >
                  {overpaid ? "Overpaid" : "Remaining to pay"}
                </Typography>
                <Typography noWrap sx={{ fontSize: 11.5, color: wsColors.muted }}>
                  {formatCurrencyFull(task.paid)} paid of {formatCurrencyFull(task.quoted)}
                </Typography>
              </Box>
              <Typography
                sx={{
                  fontSize: 19,
                  fontWeight: 800,
                  letterSpacing: "-.02em",
                  color: overpaid ? wsColors.amber : wsColors.ink,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatCurrencyFull(Math.abs(remaining))}
              </Typography>
            </Box>
          );
        })()}

        {/* Hero balance meter */}
        <BalanceMeter exposure={task.exposure} />

        {/* Agreed scope + same-angle before/after photos (anti scope-creep) */}
        <ScopeSheetPanel key={task.id} subcontractId={task.id} canEdit={canEdit} />

        {/* Bottom row */}
        <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 1.5 }}>
          <PaymentsHistoryCard contractId={task.id} />
          <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1.5 }}>
            <GoodDealCard contractId={task.id} quoted={task.quoted} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

