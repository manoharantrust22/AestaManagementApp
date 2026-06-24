"use client";

import { Box, Typography, IconButton } from "@mui/material";
import ArrowBack from "@mui/icons-material/ArrowBack";
import GroupWork from "@mui/icons-material/GroupWork";
import PaymentsRounded from "@mui/icons-material/PaymentsRounded";
import ChevronRight from "@mui/icons-material/ChevronRight";
import EditOutlined from "@mui/icons-material/EditOutlined";
import CallMerge from "@mui/icons-material/CallMerge";
import { computeInitials, type ContractMoneySplit, type ContractorGroup, type WorkspaceTask } from "@/lib/workforce/workspaceModel";
import { rollupSeverity, type ExposureResult } from "@/lib/workforce/exposure";
import { wsColors, wsRadius, wsShadow } from "@/lib/workforce/workspaceTokens";
import { formatCurrencyFull } from "@/lib/formatters";
import { BalanceMeter } from "./BalanceMeter";
import { StatCard } from "./StatCard";
import { MiniDualProgressBar } from "./MiniDualProgressBar";
import { ScopeSheetPanel } from "./ScopeSheetPanel";
import { WorkPhotosCard } from "./WorkPhotosCard";

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
  /** What the children are called — "section" under a Contract, "task" under a Section. */
  partLabel?: string;
  /** Open the edit/rename dialog for the parent. */
  onEdit?: () => void;
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
  onOpenPackage,
  onRecord,
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
  /** Open a fixed-price package's drawer. */
  onOpenPackage?: (packageId: string) => void;
  /** Opens the unified "Record" drawer for the whole contract. */
  onRecord: () => void;
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
  const partsWord = parentMode?.partLabel ?? "part";
  const partsWordTitle = `${partsWord[0].toUpperCase()}${partsWord.slice(1)}`;
  // What this node itself is called (its parts are one level below it).
  const selfWord = partsWord === "task" ? "section" : "contract";
  const remaining = r.quoted - r.paid;
  // Combine the per-task exposures into the shape BalanceMeter expects.
  const groupExposure: ExposureResult = {
    tracked,
    severity: rollupSeverity(r),
    workValue: tracked ? r.workValue : null,
    exposure: tracked ? r.exposure : null,
    ratio: tracked ? r.ratio : null,
  };
  const paidPctOfValue = r.quoted > 0 ? Math.round((r.paid / r.quoted) * 100) : 0;
  // Attendance + salary exist only on a "Full workspace" (detailed) contract whose
  // trade still runs the workspace — either this contract itself or one of its parts.
  // Count-by-role / lump parts, and any workspace-off trade, stay off those screens.
  const anyTracked =
    (parentMode?.parent.mode === "detailed" && parentMode.parent.hasWorkspace) ||
    group.tasks.some((t) => t.mode === "detailed" && t.hasWorkspace);

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

        {/* Where the paid-out money came from: Workspace (attendance/salary) vs Sections
            (fixed-price) vs Task-work (packages). */}
        <PaidSourceBreakdown split={group.moneySplit} />

        {/* Plain balance: what's still owed on the whole contract (agreed − paid). */}
        <RemainingStrip quoted={r.quoted} paid={r.paid} remaining={remaining} />

        {/* Combined balance meter */}
        <BalanceMeter exposure={groupExposure} />

        {/* Recent work-update photos + % done for the whole contract. */}
        <WorkPhotosCard contractId={parentMode?.parent.id ?? group.key} />

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
            {isParent ? `${partsWordTitle}s in this contract` : "Parts of this contract"}
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
            {group.parts.map((p, i) => {
              const clickable =
                (p.kind === "subcontract") || (p.kind === "package" && !!onOpenPackage);
              const onClick = clickable
                ? () => (p.kind === "package" ? onOpenPackage?.(p.id) : onSelectTask(p.id))
                : undefined;
              const title =
                p.kind === "direct" ? `Directly on the ${selfWord}` : p.title;
              const line =
                p.kind === "direct" && p.quoted <= 0
                  ? `paid ${formatCurrencyFull(p.paid)} · not tied to a ${partsWord}`
                  : `${formatCurrencyFull(p.quoted)} · paid ${formatCurrencyFull(
                      p.paid
                    )} · ${formatCurrencyFull(p.remaining)} left`;
              return (
                <Box
                  key={`${p.kind}:${p.id}`}
                  onClick={onClick}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    px: 1.5,
                    py: 1.1,
                    cursor: clickable ? "pointer" : "default",
                    borderTop: i === 0 ? "none" : `1px solid ${wsColors.hairline2}`,
                    "&:hover": clickable ? { bgcolor: wsColors.canvas } : {},
                  }}
                >
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.625, minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 700, color: wsColors.ink }}>
                        {title}
                      </Typography>
                      {p.kind === "package" && <PartTag label="Fixed price" />}
                      {p.kind === "direct" && <PartTag label="Whole contract" />}
                    </Box>
                    <Typography noWrap sx={{ fontSize: 11.5, color: wsColors.muted }}>
                      {line}
                    </Typography>
                  </Box>
                  <MiniDualProgressBar paidPct={p.paidFraction} workPct={p.workFraction} width={46} height={8} />
                  {clickable && <ChevronRight sx={{ fontSize: 18, color: wsColors.muted }} />}
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* Agreed scope + same-angle before/after photos for the whole contract */}
        {(parentMode?.parent.id ?? group.key) && (
          <ScopeSheetPanel
            key={parentMode?.parent.id ?? group.key}
            subcontractId={parentMode?.parent.id ?? group.key}
            canEdit={canEdit}
          />
        )}

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

        {/* One "Record" surface for the whole contract — opens the drawer with payment,
            progress, and (for a Full-workspace contract) attendance / salary. */}
        {canEdit && (
          <ActionTile
            icon={<PaymentsRounded sx={{ fontSize: 19, color: wsColors.primary }} />}
            label="Record"
            sub={
              anyTracked
                ? "Payment, progress, attendance or salary"
                : "Record a payment or update progress"
            }
            onClick={onRecord}
            enabled={canEdit}
          />
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

/**
 * "Paid out, by source" — splits the contract's paid total into Workspace (salary
 * settlements off attendance), Sections (fixed-price subcontract payments), and Task-work
 * (fixed-price packages), as a thin stacked bar + legend. Only the buckets with money
 * show; hidden entirely until something is paid.
 */
export function PaidSourceBreakdown({ split }: { split: ContractMoneySplit }) {
  const segs = [
    { key: "workspace", label: "Workspace", hint: "attendance + salary", value: split.workspace, color: wsColors.primary },
    { key: "sections", label: "Sections", hint: "fixed price", value: split.sections, color: "#0d9488" },
    { key: "taskWork", label: "Task-work", hint: "packages", value: split.taskWork, color: "#7c3aed" },
  ].filter((s) => s.value > 0);
  if (split.total <= 0 || segs.length === 0) return null;
  return (
    <Box
      sx={{
        px: 1.75,
        py: 1.25,
        borderRadius: `${wsRadius.card}px`,
        bgcolor: wsColors.surface,
        border: `1px solid ${wsColors.hairline}`,
        boxShadow: wsShadow.card,
      }}
    >
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".04em",
          textTransform: "uppercase",
          color: wsColors.muted,
          mb: 0.75,
        }}
      >
        Paid out · by source
      </Typography>
      <Box sx={{ display: "flex", height: 9, borderRadius: 999, overflow: "hidden", mb: 0.875 }}>
        {segs.map((s) => (
          <Box
            key={s.key}
            sx={{ width: `${(s.value / split.total) * 100}%`, bgcolor: s.color, minWidth: 2 }}
          />
        ))}
      </Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.25 }}>
        {segs.map((s) => (
          <Box key={s.key} sx={{ display: "flex", alignItems: "center", gap: 0.625, minWidth: 0 }}>
            <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: s.color, flexShrink: 0 }} />
            <Typography sx={{ fontSize: 12, color: wsColors.ink2 }}>
              <Box component="span" sx={{ fontWeight: 800, color: wsColors.ink }}>
                {s.label}
              </Box>{" "}
              {formatCurrencyFull(s.value)}
              <Box component="span" sx={{ color: wsColors.muted }}> · {s.hint}</Box>
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** Plain "what's still owed" balance (agreed − paid), the way the owner thinks about it. */
function RemainingStrip({
  quoted,
  paid,
  remaining,
}: {
  quoted: number;
  paid: number;
  remaining: number;
}) {
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
          {formatCurrencyFull(paid)} paid of {formatCurrencyFull(quoted)}
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
}

/** A tiny uppercase tag distinguishing package / whole-contract rows from sections. */
function PartTag({ label }: { label: string }) {
  return (
    <Box
      component="span"
      sx={{
        flexShrink: 0,
        fontSize: 9.5,
        fontWeight: 800,
        letterSpacing: ".03em",
        textTransform: "uppercase",
        color: wsColors.muted,
        bgcolor: wsColors.canvas,
        border: `1px solid ${wsColors.hairline2}`,
        borderRadius: 1,
        px: 0.625,
        py: 0.125,
        lineHeight: 1.6,
      }}
    >
      {label}
    </Box>
  );
}
