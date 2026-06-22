"use client";

import { Box, Typography, IconButton } from "@mui/material";
import ArrowBack from "@mui/icons-material/ArrowBack";
import GroupWork from "@mui/icons-material/GroupWork";
import HowToReg from "@mui/icons-material/HowToReg";
import PaymentsRounded from "@mui/icons-material/PaymentsRounded";
import ChevronRight from "@mui/icons-material/ChevronRight";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import CallMerge from "@mui/icons-material/CallMerge";
import ReceiptLong from "@mui/icons-material/ReceiptLong";
import { computeInitials, type ContractorGroup, type WorkspaceTask } from "@/lib/workforce/workspaceModel";
import { rollupSeverity, type ExposureResult } from "@/lib/workforce/exposure";
import { wsColors, wsRadius, wsShadow } from "@/lib/workforce/workspaceTokens";
import { formatCurrencyFull } from "@/lib/formatters";
import { BalanceMeter } from "./BalanceMeter";
import { StatCard } from "./StatCard";
import { MiniDualProgressBar } from "./MiniDualProgressBar";

/**
 * Extra props supplied when this view backs a REAL parent contract (a `subcontracts`
 * row the owner named, with floor children) rather than a purely visual contractor
 * group. Enables rename, record-payment, and parent-appropriate copy.
 */
export interface ParentMode {
  /** The real parent task row (for the editable name + record-payment target). */
  parent: WorkspaceTask;
  /** The parent's editable display name (e.g. "Jithin Civil contract"). */
  title: string;
  /** Open the edit/rename dialog for the parent. */
  onEdit?: () => void;
  /** Record a payment directly on the whole contract (not a single floor). */
  onRecordPayment?: () => void;
}

/**
 * "Combined contract" view — a crew's task works (e.g. Jithin's floors) shown as ONE
 * contract: rolled-up value / paid / work + the exposure verdict, with each part listed
 * below to drill into.
 *
 * Two modes:
 *  • Virtual group (no `parentMode`): a presentation-layer rollup of separate rows; offers
 *    "Make this one contract" to promote it into a real named parent.
 *  • Real parent (`parentMode` set): backed by an editable `subcontracts` row; the floors
 *    are optional children, and you can rename / record a payment on the whole contract.
 */
export function GroupDetailPane({
  group,
  tradeName,
  onSelectTask,
  onLogAttendance,
  onSettleSalary,
  canEdit,
  showBack = false,
  onBack,
  parentMode,
  onMakeOneContract,
}: {
  group: ContractorGroup;
  tradeName: string;
  /** Drill into one part (single-task detail). */
  onSelectTask: (id: string) => void;
  onLogAttendance: () => void;
  onSettleSalary: () => void;
  canEdit: boolean;
  showBack?: boolean;
  onBack?: () => void;
  /** Present when this is a real, named parent contract. */
  parentMode?: ParentMode;
  /** Virtual-group only: promote this group into a real named parent contract. */
  onMakeOneContract?: () => void;
}) {
  const r = group.rollup;
  const tracked = r.trackedCount > 0;
  const isParent = !!parentMode;
  const displayName = parentMode?.title ?? group.who;
  const partsWord = isParent ? "floor" : "part";
  // Combine the per-task exposures into the shape BalanceMeter expects.
  const groupExposure: ExposureResult = {
    tracked,
    severity: rollupSeverity(r),
    workValue: tracked ? r.workValue : null,
    exposure: tracked ? r.exposure : null,
    ratio: tracked ? r.ratio : null,
  };
  const paidPctOfValue = r.quoted > 0 ? Math.round((r.paid / r.quoted) * 100) : 0;
  // Attendance + salary exist only on tracked contracts (any mode but mesthri-only).
  const anyTracked = group.tasks.some((t) => t.mode !== "mesthri_only");

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
            {tradeName} › Combined contract
          </Typography>
          <Typography sx={{ fontSize: 16.5, fontWeight: 800, color: wsColors.ink, letterSpacing: "-.02em" }} noWrap>
            {displayName}
          </Typography>
        </Box>
        {isParent && canEdit && parentMode?.onEdit && (
          <IconButton size="small" onClick={parentMode.onEdit} aria-label="Rename contract">
            <EditOutlined sx={{ fontSize: 19, color: wsColors.muted }} />
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
            {computeInitials(group.who)}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 800, color: wsColors.ink }} noWrap>
              {displayName}
            </Typography>
            <Typography sx={{ fontSize: 12.5, color: wsColors.muted }}>
              {isParent
                ? `${group.who} · ${group.tasks.length} ${partsWord}${group.tasks.length === 1 ? "" : "s"} · one contract`
                : `${group.tasks.length} works · shown as one contract`}
            </Typography>
          </Box>
        </Box>

        {/* What this view is */}
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            gap: 1,
            px: 1.25,
            py: 0.85,
            borderRadius: `${wsRadius.input}px`,
            bgcolor: wsColors.primaryTint,
            border: `1px solid #d3e0fb`,
          }}
        >
          <GroupWork sx={{ fontSize: 18, color: wsColors.primary, mt: 0.1 }} />
          <Typography sx={{ fontSize: 11.5, color: wsColors.ink2, flex: 1 }}>
            {isParent ? (
              <>
                One contract for {group.who}. The {partsWord}s below are kept as optional parts — open one
                only when you need that detail. A payment recorded on the whole contract isn&apos;t tied to any
                single {partsWord}.
              </>
            ) : (
              <>
                Combined view of {group.who}&apos;s {group.tasks.length} task works. The totals below add up
                every part; open a part to record a payment or change its progress.
              </>
            )}
          </Typography>
        </Box>

        {/* Stat cards */}
        <Box sx={{ display: "flex", gap: 1 }}>
          <StatCard label="Contract value" value={formatCurrencyFull(r.quoted)} />
          <StatCard
            label="Work done"
            value={formatCurrencyFull(r.workValue)}
            sub={tracked ? `${r.trackedCount} of ${group.tasks.length} tracked` : "Not tracked"}
          />
          <StatCard
            label="Paid out"
            value={formatCurrencyFull(r.paid)}
            valueColor={wsColors.primary}
            sub={`${paidPctOfValue}% of value`}
          />
        </Box>

        {/* Combined balance meter */}
        <BalanceMeter exposure={groupExposure} />

        {/* Parts of this contract */}
        <Box>
          <Typography
            sx={{
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: ".05em",
              textTransform: "uppercase",
              color: wsColors.muted2,
              mb: 0.5,
            }}
          >
            {isParent ? "Floors in this contract" : "Parts of this contract"}
          </Typography>
          <Box
            sx={{
              bgcolor: wsColors.surface,
              border: `1px solid ${wsColors.hairline}`,
              borderRadius: `${wsRadius.card}px`,
              boxShadow: wsShadow.card,
              overflow: "hidden",
            }}
          >
            {group.tasks.map((t, i) => {
              const paidPct = Math.round(t.paidPctOfQuoted * 100);
              const workTxt = t.workPercent == null ? "—" : `${t.workPercent}%`;
              return (
                <Box
                  key={t.id}
                  onClick={() => onSelectTask(t.id)}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    px: 1.5,
                    py: 1.1,
                    cursor: "pointer",
                    borderTop: i === 0 ? "none" : `1px solid ${wsColors.hairline2}`,
                    "&:hover": { bgcolor: wsColors.canvas },
                  }}
                >
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 700, color: wsColors.ink }}>
                      {t.title}
                    </Typography>
                    <Typography noWrap sx={{ fontSize: 11.5, color: wsColors.muted }}>
                      {formatCurrencyFull(t.quoted)} · paid {paidPct}% · work {workTxt}
                    </Typography>
                  </Box>
                  <MiniDualProgressBar paidPct={t.paidPctOfQuoted} workPct={t.work} width={46} height={8} />
                  <ChevronRight sx={{ fontSize: 18, color: wsColors.muted }} />
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* Promote a virtual group into a real, named contract */}
        {!isParent && onMakeOneContract && (
          <ActionTile
            icon={<CallMerge sx={{ fontSize: 19, color: wsColors.primary }} />}
            label="Make this one contract"
            sub={`Name ${group.who}'s ${group.tasks.length} works as a single contract`}
            onClick={onMakeOneContract}
            enabled={canEdit}
          />
        )}

        {/* Record a payment on the whole parent contract (not floor-specific) */}
        {isParent && parentMode?.onRecordPayment && (
          <ActionTile
            icon={<ReceiptLong sx={{ fontSize: 19, color: wsColors.primary }} />}
            label="Record payment"
            sub="Pay against the whole contract"
            onClick={parentMode.onRecordPayment}
            enabled={canEdit}
          />
        )}

        {/* Contractor-level actions */}
        {anyTracked && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <ActionTile
              icon={<HowToReg sx={{ fontSize: 19, color: wsColors.primary }} />}
              label="Log attendance"
              sub={`Record days for ${group.who}'s crew`}
              onClick={onLogAttendance}
              enabled={canEdit}
            />
            <ActionTile
              icon={<PaymentsRounded sx={{ fontSize: 19, color: wsColors.primary }} />}
              label="Settle salary"
              sub="Open this crew's salary settlement"
              onClick={onSettleSalary}
              enabled={canEdit}
            />
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.75, px: 0.5 }}>
              <InfoOutlined sx={{ fontSize: 15, color: wsColors.muted, mt: 0.1 }} />
              <Typography sx={{ fontSize: 11, color: wsColors.muted }}>
                Logging labour still asks which floor it belongs to. A &ldquo;whole contract / no specific
                floor&rdquo; option is coming next.
              </Typography>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}

/** A clickable card linking out to a contractor-scoped screen (attendance / salary). */
function ActionTile({
  icon,
  label,
  sub,
  onClick,
  enabled,
}: {
  icon: React.ReactNode;
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
        opacity: enabled ? 1 : 0.5,
        "&:hover": enabled ? { borderColor: "#d3e0fb", bgcolor: wsColors.primaryTint } : {},
      }}
    >
      <Box
        sx={{
          width: 38,
          height: 38,
          borderRadius: `${wsRadius.avatar}px`,
          bgcolor: "#eaf0fc",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: wsColors.ink }}>{label}</Typography>
        <Typography noWrap sx={{ fontSize: 12, color: wsColors.muted }}>
          {sub}
        </Typography>
      </Box>
      <ChevronRight sx={{ fontSize: 20, color: wsColors.muted }} />
    </Box>
  );
}
