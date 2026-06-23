"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Box, Typography, Collapse, Button, IconButton, Tooltip } from "@mui/material";
import ChevronRight from "@mui/icons-material/ChevronRight";
import Add from "@mui/icons-material/Add";
import LaunchRounded from "@mui/icons-material/LaunchRounded";
import { rollupSeverity } from "@/lib/workforce/exposure";
import type { ContractNode, TradeNode, WorkspaceTask } from "@/lib/workforce/workspaceModel";
import {
  severityMeta,
  statusMeta,
  tierMeta,
  tradeIcon,
  wsColors,
  wsRadius,
} from "@/lib/workforce/workspaceTokens";
import type { Severity } from "@/lib/workforce/exposure";
import type { ContractStatus } from "@/types/trade.types";
import { type TaskWorkPackageWithMeta } from "@/types/taskWork.types";
import {
  statusBucket,
  EMPTY_TAB_COPY,
  type StatusTab,
} from "@/lib/workforce/statusTabs";
import { formatCompactINR } from "@/lib/formatters";
import { MiniDualProgressBar } from "./MiniDualProgressBar";

/**
 * Signature for "add the next level down". `ctx.parentId` is the subcontract this new row
 * nests under (null for a fresh top-level Contract); `ctx.tier` is what we're creating.
 */
export type AddTaskWork = (
  tradeCategoryId: string,
  ctx: { parentId: string | null; tier: "contract" | "section" | "task" },
  initialStatus?: "draft" | "active"
) => void;

/** Over-exposed severities — the only ones that earn a row-level flag. */
const isAtRisk = (severity: Severity): boolean =>
  severity === "high" || severity === "watch";

/**
 * Exception-based risk flag. Shown ONLY when a row is over-exposed (paid running ahead
 * of work). Healthy rows stay calm — the paid/work bar already carries their status, and
 * the Future/Active/Completed tabs carry lifecycle, so an always-on dot would just be noise.
 */
function AtRiskChip({ severity }: { severity: Severity }) {
  const m = severityMeta[severity];
  const Icon = m.icon;
  return (
    <Box
      component="span"
      sx={{
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        gap: 0.3,
        fontSize: 9.5,
        fontWeight: 800,
        letterSpacing: ".02em",
        lineHeight: 1.5,
        px: 0.6,
        py: 0.05,
        borderRadius: 999,
        color: m.color,
        bgcolor: m.bg,
        whiteSpace: "nowrap",
      }}
    >
      <Icon sx={{ fontSize: 11 }} />
      {m.label}
    </Box>
  );
}

/**
 * The trailing zone overlaps two layers in one grid cell so quiet status (at rest) and the
 * contextual actions (on hover / always on touch) crossfade in the SAME spot — no layout
 * shift, no permanent whitespace. Both children share row 1 / column 1.
 */
const overlapSlotSx = {
  display: "grid",
  alignItems: "center",
  justifyItems: "end",
  flexShrink: 0,
  "& > *": { gridColumn: 1, gridRow: 1 },
} as const;

/**
 * Hover/touch reveal applied to a row: status fades out and the action group fades in on
 * hover (desktop) or keyboard focus; on touch devices (no hover) the actions are always
 * shown and the status layer is hidden. Pure CSS — no JS device sniffing, no re-renders.
 */
const revealSx = {
  "& .ws-status": { transition: "opacity .14s ease" },
  "& .ws-actions": {
    opacity: 0,
    pointerEvents: "none",
    transition: "opacity .14s ease",
  },
  "&:hover .ws-status, &:focus-within .ws-status": {
    opacity: 0,
    pointerEvents: "none",
  },
  "&:hover .ws-actions, &:focus-within .ws-actions": {
    opacity: 1,
    pointerEvents: "auto",
  },
  "@media (hover: none)": {
    "& .ws-status": { display: "none" },
    "& .ws-actions": { opacity: 1, pointerEvents: "auto" },
  },
} as const;

/**
 * Small lifecycle-status chip (Planned / On hold / Done …). Tinted, deliberately
 * calmer than the exposure dot so the two signals don't collide. With the status
 * tabs already segmenting buckets it's a secondary cue — shown only where it adds
 * information (e.g. an `on_hold` contract sitting inside the Active tab).
 */
function StatusChip({ status }: { status: ContractStatus }) {
  const m = statusMeta[status];
  if (!m) return null;
  return (
    <Box
      component="span"
      sx={{
        flexShrink: 0,
        fontSize: 9.5,
        fontWeight: 800,
        letterSpacing: ".02em",
        lineHeight: 1.5,
        px: 0.65,
        borderRadius: 999,
        color: m.color,
        bgcolor: m.bg,
        whiteSpace: "nowrap",
      }}
    >
      {m.label}
    </Box>
  );
}

/** Tiny structural tag (CONTRACT / SECTION / TASK) so the row's level is unmistakable. */
function TierTag({ tier }: { tier: ContractNode["tier"] }) {
  const m = tierMeta[tier];
  const Icon = m.icon;
  return (
    <Box
      component="span"
      sx={{
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        gap: 0.3,
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: ".05em",
        textTransform: "uppercase",
        lineHeight: 1.6,
        px: 0.5,
        borderRadius: 999,
        color: m.color,
        bgcolor: m.bg,
        whiteSpace: "nowrap",
      }}
    >
      <Icon sx={{ fontSize: 11 }} />
      {m.label}
    </Box>
  );
}

/** Vertical center (px) of a child row — where the elbow connector meets it. */
const TREE_ROW_CENTER = 19;

/**
 * Wraps a child row with a Figma-style tree connector: a vertical spine on the left
 * and a short horizontal elbow into the row. The spine of the last child stops at the
 * elbow so the branch ends cleanly instead of overshooting past the final row. Applied
 * at EVERY level so Contract → Section → Task all read as one connected ladder.
 */
function TreeBranch({
  isLast,
  children,
}: {
  isLast: boolean;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        position: "relative",
        pl: 2.25,
        "&::before": {
          // vertical spine
          content: '""',
          position: "absolute",
          left: 7,
          top: 0,
          height: isLast ? TREE_ROW_CENTER : "100%",
          width: "1.5px",
          bgcolor: wsColors.hairline,
        },
        "&::after": {
          // horizontal elbow into the row
          content: '""',
          position: "absolute",
          left: 7,
          top: TREE_ROW_CENTER,
          width: 10,
          height: "1.5px",
          bgcolor: wsColors.hairline,
        },
      }}
    >
      {children}
    </Box>
  );
}

function PackageRow({
  pkg,
  onOpen,
}: {
  pkg: TaskWorkPackageWithMeta;
  onOpen: () => void;
}) {
  return (
    <Box
      onClick={onOpen}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 1.25,
        py: 0.9,
        borderRadius: `${wsRadius.row}px`,
        cursor: "pointer",
        "&:hover": { bgcolor: wsColors.canvas },
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600, color: wsColors.ink }}>
          {pkg.title}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.6, minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 11.5, color: wsColors.muted, minWidth: 0 }}>
            {pkg.maistry_name ?? "—"} · Fixed price
          </Typography>
          <StatusChip status={pkg.status} />
        </Box>
      </Box>
      <Typography sx={{ fontSize: 13, fontWeight: 700, color: wsColors.ink }}>
        {formatCompactINR(Number(pkg.total_value ?? 0))}
      </Typography>
    </Box>
  );
}

/**
 * Inviting first-child prompt shown inside a container that has nothing under it yet.
 * Turns an empty Contract/Section into a clear next step instead of a dead end.
 */
function EmptyChildCTA({
  childLabel,
  planMode,
  onAdd,
}: {
  childLabel: string;
  planMode: boolean;
  onAdd: () => void;
}) {
  return (
    <Box
      onClick={onAdd}
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 0.5,
        py: 0.9,
        px: 1,
        borderRadius: `${wsRadius.row}px`,
        border: `1.5px dashed ${wsColors.hairline}`,
        cursor: "pointer",
        color: wsColors.primary,
        fontSize: 12.5,
        fontWeight: 700,
        transition: "background-color .14s ease, border-color .14s ease",
        "&:hover": { bgcolor: wsColors.primaryTint, borderColor: wsColors.primary },
      }}
    >
      <Add sx={{ fontSize: 16 }} />
      {planMode ? `Plan the first ${childLabel}` : `Add the first ${childLabel}`}
    </Box>
  );
}

function matchesQuery(task: WorkspaceTask, q: string): boolean {
  if (!q) return true;
  const hay = `${task.title} ${task.who} ${task.tradeName} ${task.stageName ?? ""}`.toLowerCase();
  return hay.includes(q);
}

function pkgMatchesQuery(p: TaskWorkPackageWithMeta, q: string): boolean {
  if (!q) return true;
  return `${p.title} ${p.maistry_name ?? ""}`.toLowerCase().includes(q);
}

const SECTION_LABEL_SX = {
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: ".05em",
  textTransform: "uppercase" as const,
  color: wsColors.muted2,
  px: 1.25,
  mb: 0.25,
};

/** Everything a recursive ContractRow needs, bundled so the tree is easy to thread. */
interface TreeCtx {
  tradeCategoryId: string;
  q: string;
  activeTab: StatusTab;
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  onAddTaskWork: AddTaskWork;
  onOpenPackage: (pkg: TaskWorkPackageWithMeta) => void;
  openGroups: Record<string, boolean>;
  setGroupOpen: (k: string, next: boolean) => void;
  taskVisible: (t: WorkspaceTask) => boolean;
  pkgVisible: (p: TaskWorkPackageWithMeta) => boolean;
  pkgsByParentId: Map<string, TaskWorkPackageWithMeta[]>;
  showAddAffordances: boolean;
  addStatus: "draft" | "active";
}

/** Packages attached to this node, filtered to the active tab. */
const visiblePkgsOf = (node: ContractNode, ctx: TreeCtx) =>
  (ctx.pkgsByParentId.get(node.task.id) ?? []).filter(ctx.pkgVisible);

/** A node shows when itself, any descendant, or any attached package is visible in the tab. */
function isNodeVisible(node: ContractNode, ctx: TreeCtx): boolean {
  if (ctx.taskVisible(node.task)) return true;
  if (visiblePkgsOf(node, ctx).length > 0) return true;
  return node.children.some((c) => isNodeVisible(c, ctx));
}

/**
 * One row in the Contract ▸ Section ▸ Task ladder, recursing over its children.
 *
 * Interaction (fixes the mobile "tap jumps to full screen" problem):
 *  • A container (Contract/Section) → tapping the ROW expands/collapses its children
 *    (big hit area); a trailing "Open" button opens its detail pane.
 *  • A leaf (Task) → tapping the row opens its detail.
 */
function ContractRow({
  node,
  depth,
  isLast,
  ctx,
}: {
  node: ContractNode;
  depth: number;
  isLast: boolean;
  ctx: TreeCtx;
}) {
  if (!isNodeVisible(node, ctx)) return null;

  const t = node.task;
  const selected = ctx.selectedTaskId === t.id;
  const expandable = node.tier !== "task"; // Contracts & Sections can hold children
  const childNodes = node.children;
  const pkgs = visiblePkgsOf(node, ctx);
  const hasParts = childNodes.length > 0 || pkgs.length > 0;
  const open = ctx.q ? true : ctx.openGroups[t.id] ?? depth === 0;

  // A node with parts summarises its rollup; otherwise it reads like a single job.
  const tm = tierMeta[node.tier];
  const partCount = childNodes.length + pkgs.length; // for the connector isLast logic
  // The summary counts real child rows by their tier word; fixed-price packages are a
  // different kind of item, so count them separately rather than mislabelling them.
  const summaryParts: string[] = [];
  if (childNodes.length > 0)
    summaryParts.push(`${childNodes.length} ${tm.childLabel}${childNodes.length === 1 ? "" : "s"}`);
  if (pkgs.length > 0)
    summaryParts.push(`${pkgs.length} package${pkgs.length === 1 ? "" : "s"}`);
  const sqftLabel =
    t.measurementUnit === "sqft" && t.totalUnits
      ? `${t.totalUnits.toLocaleString("en-IN")} sqft${t.ratePerUnit ? ` × ₹${t.ratePerUnit}` : ""}`
      : null;
  const paidPct = Math.round(t.paidPctOfQuoted * 100);
  const workTxt = t.workPercent == null ? "—" : `${t.workPercent}%`;
  const secondary = hasParts
    ? `${t.who} · ${summaryParts.join(" + ")} · ${formatCompactINR(node.rollup.quoted)}`
    : sqftLabel
      ? `${t.who} · ${sqftLabel}`
      : `${t.who} · paid ${paidPct}% · work ${workTxt}`;

  // Severity + dual bar: a node with parts reflects its rollup; a single job, itself.
  const sev = hasParts ? rollupSeverity(node.rollup) : t.exposure.severity;
  const atRisk = isAtRisk(sev);
  const r = node.rollup;
  const showBar = hasParts ? r.trackedCount > 0 : t.work != null || t.paid > 0;
  const barPaid = hasParts ? (r.quotedTracked > 0 ? r.paidTracked / r.quotedTracked : 0) : t.paidPctOfQuoted;
  const barWork = hasParts ? (r.quotedTracked > 0 ? r.workValue / r.quotedTracked : 0) : t.work;

  const selectSx = {
    border: `1px solid ${selected ? "#d3e0fb" : "transparent"}`,
    bgcolor: selected ? wsColors.primaryTint : "transparent",
    "&:hover": { bgcolor: selected ? wsColors.primaryTint : wsColors.canvas },
  };

  return (
    <Box sx={{ mt: depth === 0 ? 0.5 : 0 }}>
      <Box
        onClick={() => (expandable ? ctx.setGroupOpen(t.id, !open) : ctx.onSelectTask(t.id))}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 1,
          py: 0.6,
          borderRadius: `${wsRadius.row}px`,
          cursor: "pointer",
          ...selectSx,
          // Containers reveal their "＋ add child / open" actions on hover (desktop) or
          // always (touch); leaf tasks just open on row-tap, so no reveal needed.
          ...(expandable ? revealSx : {}),
        }}
      >
        {expandable ? (
          <ChevronRight
            sx={{
              fontSize: 18,
              flexShrink: 0,
              color: wsColors.muted,
              transition: "transform .18s ease",
              transform: open ? "rotate(90deg)" : "none",
            }}
          />
        ) : (
          // Spacer keeps leaf titles aligned with their expandable siblings.
          <Box sx={{ width: 18, flexShrink: 0 }} />
        )}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
            <TierTag tier={node.tier} />
            <Typography
              noWrap
              sx={{
                fontSize: 13,
                fontWeight: selected ? 800 : tm.weight,
                color: selected ? wsColors.primary : wsColors.ink,
                letterSpacing: "-.01em",
                minWidth: 0,
              }}
            >
              {t.title}
            </Typography>
            {t.status === "on_hold" && <StatusChip status={t.status} />}
          </Box>
          <Typography noWrap sx={{ fontSize: 11, color: wsColors.muted }}>
            {secondary}
          </Typography>
        </Box>
        {expandable ? (
          // Container: quiet status (paid/work bar + at-risk flag) crossfades to the
          // contextual actions — "＋ Add {child}" (the hero) and "Open ↗".
          <Box className="ws-trailing" sx={overlapSlotSx}>
            <Box
              className="ws-status"
              sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
            >
              {showBar && (
                <MiniDualProgressBar paidPct={barPaid} workPct={barWork} width={40} height={7} />
              )}
              {atRisk && <AtRiskChip severity={sev} />}
            </Box>
            <Box
              className="ws-actions"
              sx={{ display: "flex", alignItems: "center", gap: 0.25 }}
            >
              {ctx.showAddAffordances && (
                <Tooltip title={`Add ${tm.childLabel}`}>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      ctx.onAddTaskWork(
                        ctx.tradeCategoryId,
                        { parentId: t.id, tier: node.tier === "contract" ? "section" : "task" },
                        ctx.addStatus
                      );
                    }}
                    aria-label={`Add ${tm.childLabel}`}
                    sx={{ p: 0.4, color: wsColors.primary }}
                  >
                    <Add sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Open details">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    ctx.onSelectTask(t.id);
                  }}
                  aria-label="Open details"
                  sx={{ p: 0.4, color: wsColors.muted }}
                >
                  <LaunchRounded sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        ) : (
          // Leaf task: status only (tap the row to open its detail).
          (showBar || atRisk) && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
              {showBar && (
                <MiniDualProgressBar paidPct={barPaid} workPct={barWork} width={40} height={7} />
              )}
              {atRisk && <AtRiskChip severity={sev} />}
            </Box>
          )
        )}
      </Box>

      {expandable && (
        <Collapse in={open} unmountOnExit>
          <Box sx={{ pt: 0.25 }}>
            {childNodes.map((c, i) => {
              const last = i === partCount - 1 && pkgs.length === 0;
              return (
                <TreeBranch key={c.task.id} isLast={last}>
                  <ContractRow node={c} depth={depth + 1} isLast={last} ctx={ctx} />
                </TreeBranch>
              );
            })}
            {pkgs.map((p, j) => (
              <TreeBranch key={p.id} isLast={childNodes.length + j === partCount - 1}>
                <PackageRow pkg={p} onOpen={() => ctx.onOpenPackage(p)} />
              </TreeBranch>
            ))}
            {ctx.showAddAffordances && (
              <TreeBranch isLast>
                {hasParts ? (
                  <Button
                    size="small"
                    startIcon={<Add sx={{ fontSize: 16 }} />}
                    onClick={() =>
                      ctx.onAddTaskWork(
                        ctx.tradeCategoryId,
                        { parentId: t.id, tier: node.tier === "contract" ? "section" : "task" },
                        ctx.addStatus
                      )
                    }
                    sx={{ textTransform: "none", color: wsColors.primary, fontWeight: 700 }}
                  >
                    {ctx.addStatus === "draft" ? "Plan a" : "Add a"} {tm.childLabel}
                  </Button>
                ) : (
                  <EmptyChildCTA
                    childLabel={tm.childLabel}
                    planMode={ctx.addStatus === "draft"}
                    onAdd={() =>
                      ctx.onAddTaskWork(
                        ctx.tradeCategoryId,
                        { parentId: t.id, tier: node.tier === "contract" ? "section" : "task" },
                        ctx.addStatus
                      )
                    }
                  />
                )}
              </TreeBranch>
            )}
          </Box>
        </Collapse>
      )}
    </Box>
  );
}

export function ContractTree({
  canEdit,
  trades,
  selectedTaskId,
  onSelectTask,
  openTrades,
  onToggleTrade,
  query,
  activeTab,
  packagesByTrade,
  onOpenPackage,
  onAddTaskWork,
}: {
  siteId: string;
  canEdit: boolean;
  trades: TradeNode[];
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
  openTrades: Record<string, boolean>;
  onToggleTrade: (categoryId: string) => void;
  query: string;
  /** Which lifecycle bucket the tree is filtered to (Future / Active / Completed). */
  activeTab: StatusTab;
  packagesByTrade: Map<string, TaskWorkPackageWithMeta[]>;
  onOpenPackage: (pkg: TaskWorkPackageWithMeta) => void;
  onAddTaskWork: AddTaskWork;
}) {
  const q = query.trim().toLowerCase();
  const taskVisible = (t: WorkspaceTask) =>
    statusBucket(t.status) === activeTab && matchesQuery(t, q);
  const pkgVisible = (p: TaskWorkPackageWithMeta) =>
    statusBucket(p.status) === activeTab && pkgMatchesQuery(p, q);
  // Adding / planning work doesn't belong on the Completed tab.
  const showAddAffordances = canEdit && !q && activeTab !== "completed";
  const addStatus: "draft" | "active" = activeTab === "future" ? "draft" : "active";
  // Containers default open at the top level (so nesting is obvious) and closed below.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const setGroupOpen = (k: string, next: boolean) =>
    setOpenGroups((p) => ({ ...p, [k]: next }));
  // Trades with nothing in this tab collapse into one footer so active work scans easily.
  const [emptyOpenRaw, setEmptyOpen] = useState<boolean | null>(null);

  const visibleTrades = useMemo(() => {
    if (!q) return trades;
    return trades.filter((t) => {
      const anyTask = t.tasks.some((task) => matchesQuery(task, q));
      const anyPkg = (packagesByTrade.get(t.category.id) ?? []).some((p) =>
        pkgMatchesQuery(p, q)
      );
      return anyTask || anyPkg;
    });
  }, [trades, q, packagesByTrade]);

  const renderNode = (node: TradeNode) => {
    const pkgs = packagesByTrade.get(node.category.id) ?? [];
    // Badge / empty-prompt count reflects only what's visible in the active tab.
    const count =
      node.tasks.filter(taskVisible).length + pkgs.filter(pkgVisible).length;
    const open = q ? true : openTrades[node.category.id] ?? false;
    const Trade = tradeIcon(node.category.name);
    const headerBar =
      node.rollup.trackedCount > 0 ? (
        <MiniDualProgressBar
          paidPct={
            node.rollup.quotedTracked > 0
              ? node.rollup.paidTracked / node.rollup.quotedTracked
              : 0
          }
          workPct={
            node.rollup.quotedTracked > 0
              ? node.rollup.workValue / node.rollup.quotedTracked
              : 0
          }
          width={40}
          height={7}
        />
      ) : null;

    // Attach each package to the node (Contract/Section/Task) it names as its parent.
    const allNodeIds = new Set<string>();
    const collectIds = (n: ContractNode) => {
      allNodeIds.add(n.task.id);
      n.children.forEach(collectIds);
    };
    node.contracts.forEach(collectIds);
    const pkgsByParentId = new Map<string, TaskWorkPackageWithMeta[]>();
    for (const p of pkgs) {
      if (p.parent_subcontract_id && allNodeIds.has(p.parent_subcontract_id)) {
        const arr = pkgsByParentId.get(p.parent_subcontract_id) ?? [];
        arr.push(p);
        pkgsByParentId.set(p.parent_subcontract_id, arr);
      }
    }
    const loosePkgs = pkgs.filter(
      (p) => !p.parent_subcontract_id || !allNodeIds.has(p.parent_subcontract_id)
    );
    const filteredLoosePkgs = loosePkgs.filter(pkgVisible);

    const ctx: TreeCtx = {
      tradeCategoryId: node.category.id,
      q,
      activeTab,
      selectedTaskId,
      onSelectTask,
      onAddTaskWork,
      onOpenPackage,
      openGroups,
      setGroupOpen,
      taskVisible,
      pkgVisible,
      pkgsByParentId,
      showAddAffordances,
      addStatus,
    };

    const visibleContracts = node.contracts.filter((c) => isNodeVisible(c, ctx));

    return (
      <Box key={node.category.id} sx={{ mb: 0.5 }}>
        {/* Trade group header */}
        <Box
          onClick={() => onToggleTrade(node.category.id)}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 1,
            py: 1,
            borderRadius: `${wsRadius.row}px`,
            cursor: "pointer",
            "&:hover": { bgcolor: wsColors.canvas },
            // Reveal "＋ Add contract" on hover (desktop) / always (touch).
            ...(showAddAffordances ? revealSx : {}),
          }}
        >
          <ChevronRight
            sx={{
              fontSize: 20,
              color: wsColors.muted,
              transition: "transform .18s ease",
              transform: open ? "rotate(90deg)" : "none",
            }}
          />
          <Trade sx={{ fontSize: 20, color: wsColors.ink2 }} />
          <Typography
            sx={{
              flex: 1,
              fontSize: 14.5,
              fontWeight: 800,
              color: wsColors.ink,
              letterSpacing: "-.01em",
            }}
            noWrap
          >
            {node.category.name}
          </Typography>
          {count > 0 && (
            <Box
              sx={{
                fontSize: 11,
                fontWeight: 700,
                color: wsColors.muted,
                bgcolor: wsColors.canvas,
                borderRadius: 999,
                px: 0.9,
                py: 0.1,
                minWidth: 20,
                textAlign: "center",
              }}
            >
              {count}
            </Box>
          )}
          {showAddAffordances ? (
            <Box className="ws-trailing" sx={overlapSlotSx}>
              <Box className="ws-status" sx={{ display: "flex", alignItems: "center" }}>
                {headerBar}
              </Box>
              <Box className="ws-actions" sx={{ display: "flex", alignItems: "center" }}>
                <Tooltip title={`Add ${node.category.name} contract`}>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddTaskWork(
                        node.category.id,
                        { parentId: null, tier: "contract" },
                        addStatus
                      );
                    }}
                    aria-label={`Add ${node.category.name} contract`}
                    sx={{ p: 0.4, color: wsColors.primary }}
                  >
                    <Add sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>
          ) : (
            headerBar
          )}
        </Box>

        <Collapse in={open} unmountOnExit>
          <Box sx={{ pl: 2, pr: 0.5, pb: 0.5 }}>
            {visibleContracts.map((c, i) => (
              <ContractRow
                key={c.task.id}
                node={c}
                depth={0}
                isLast={i === visibleContracts.length - 1}
                ctx={ctx}
              />
            ))}

            {/* Start another contract under this trade (or the first one). */}
            {showAddAffordances && (
              <Button
                size="small"
                startIcon={<Add sx={{ fontSize: 16 }} />}
                onClick={() =>
                  onAddTaskWork(node.category.id, { parentId: null, tier: "contract" }, addStatus)
                }
                sx={{ ml: 0.5, mt: 0.5, textTransform: "none", color: wsColors.primary, fontWeight: 700 }}
              >
                {activeTab === "future" ? "Plan a" : "New"} {node.category.name} contract
              </Button>
            )}

            {/* Loose fixed-price packages (not attached to any contract / section / task) */}
            {filteredLoosePkgs.length > 0 && (
              <Box sx={{ mt: 0.75 }}>
                <Typography sx={SECTION_LABEL_SX}>Fixed-price packages</Typography>
                {filteredLoosePkgs.map((p) => (
                  <PackageRow key={p.id} pkg={p} onOpen={() => onOpenPackage(p)} />
                ))}
              </Box>
            )}
          </Box>
        </Collapse>
      </Box>
    );
  };

  const tradeCountInTab = (n: TradeNode) =>
    n.tasks.filter(taskVisible).length +
    (packagesByTrade.get(n.category.id) ?? []).filter(pkgVisible).length;
  const activeTrades = visibleTrades.filter((n) => tradeCountInTab(n) > 0);
  const emptyTrades = visibleTrades.filter((n) => tradeCountInTab(n) === 0);
  const emptyOpen = emptyOpenRaw ?? false;
  const emptySuffix =
    activeTab === "future"
      ? "nothing planned"
      : activeTab === "completed"
        ? "nothing completed"
        : "no work yet";

  return (
    <Box>
      {activeTrades.map(renderNode)}

      {/* Nothing in this tab at all — a calm empty state, not a wall of empty trades. */}
      {!q && activeTrades.length === 0 && (
        <Box sx={{ px: 1.5, py: 4, textAlign: "center" }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: wsColors.ink2 }}>
            {EMPTY_TAB_COPY[activeTab]}
          </Typography>
          <Typography sx={{ fontSize: 11.5, color: wsColors.muted, mt: 0.5 }}>
            {activeTab === "completed"
              ? "Finished contracts and packages collect here."
              : activeTab === "future"
                ? "Plan a contract ahead of time, then move it to Active."
                : "Active work shows here once you set up a contract."}
          </Typography>
        </Box>
      )}

      {!q && activeTrades.length > 0 && emptyTrades.length > 0 && (
        <Box sx={{ mt: 0.75 }}>
          <Box
            onClick={() => setEmptyOpen((o) => !(o ?? false))}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              px: 1,
              py: 0.85,
              borderRadius: `${wsRadius.row}px`,
              cursor: "pointer",
              "&:hover": { bgcolor: wsColors.canvas },
            }}
          >
            <ChevronRight
              sx={{
                fontSize: 18,
                color: wsColors.muted,
                transition: "transform .18s ease",
                transform: emptyOpen ? "rotate(90deg)" : "none",
              }}
            />
            <Typography
              sx={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: wsColors.muted }}
              noWrap
            >
              {emptyTrades.length} more{" "}
              {emptyTrades.length === 1 ? "trade" : "trades"} · {emptySuffix}
            </Typography>
          </Box>
          <Collapse in={emptyOpen} unmountOnExit>
            <Box sx={{ pt: 0.25 }}>{emptyTrades.map(renderNode)}</Box>
          </Collapse>
        </Box>
      )}
    </Box>
  );
}
