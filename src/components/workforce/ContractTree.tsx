"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Box, Typography, Collapse, Button, IconButton, InputBase, Tooltip } from "@mui/material";
import ChevronRight from "@mui/icons-material/ChevronRight";
import Add from "@mui/icons-material/Add";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import Check from "@mui/icons-material/Check";
import Close from "@mui/icons-material/Close";
import { rollupSeverity } from "@/lib/workforce/exposure";
import type { TradeNode, WorkspaceTask } from "@/lib/workforce/workspaceModel";
import {
  severityMeta,
  statusMeta,
  tradeIcon,
  wsColors,
  wsRadius,
} from "@/lib/workforce/workspaceTokens";
import type { Severity } from "@/lib/workforce/exposure";
import type { ContractStatus, WorkStage } from "@/types/trade.types";
import { type TaskWorkPackageWithMeta } from "@/types/taskWork.types";
import {
  statusBucket,
  EMPTY_TAB_COPY,
  type StatusTab,
} from "@/lib/workforce/statusTabs";
import { formatCompactINR } from "@/lib/formatters";
import { useAddWorkStage, useUpdateWorkStage, useDeleteWorkStage } from "@/hooks/queries/useWorkStages";
import { MiniDualProgressBar } from "./MiniDualProgressBar";

function SeverityDot({ severity, size = 8 }: { severity: Severity; size?: number }) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: "50%",
        bgcolor: severityMeta[severity].dot,
        flexShrink: 0,
      }}
    />
  );
}

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

/** Vertical center (px) of a child row — where the elbow connector meets it. */
const TREE_ROW_CENTER = 19;

/**
 * Wraps a child row with a Figma-style tree connector: a vertical spine on the left
 * and a short horizontal elbow into the row. The spine of the last child stops at the
 * elbow so the branch ends cleanly instead of overshooting past the final row.
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

function TaskRow({
  task,
  selected,
  onSelect,
}: {
  task: WorkspaceTask;
  selected: boolean;
  onSelect: () => void;
}) {
  const paidPct = Math.round(task.paidPctOfQuoted * 100);
  const workTxt = task.workPercent == null ? "—" : `${task.workPercent}%`;
  // Area-priced contracts read better as "1,200 sqft × ₹250" than paid/work %.
  const sqftLabel =
    task.measurementUnit === "sqft" && task.totalUnits
      ? `${task.totalUnits.toLocaleString("en-IN")} sqft${
          task.ratePerUnit ? ` × ₹${task.ratePerUnit}` : ""
        }`
      : null;
  return (
    <Box
      onClick={onSelect}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 1.25,
        py: 0.9,
        borderRadius: `${wsRadius.row}px`,
        cursor: "pointer",
        border: `1px solid ${selected ? "#d3e0fb" : "transparent"}`,
        bgcolor: selected ? wsColors.primaryTint : "transparent",
        "&:hover": { bgcolor: selected ? wsColors.primaryTint : wsColors.canvas },
      }}
    >
      <SeverityDot severity={task.exposure.severity} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.6, minWidth: 0 }}>
          <Typography
            noWrap
            sx={{
              fontSize: 13.5,
              fontWeight: selected ? 800 : 600,
              color: selected ? wsColors.primary : wsColors.ink,
              letterSpacing: "-.01em",
              minWidth: 0,
            }}
          >
            {task.title}
          </Typography>
          {task.status === "on_hold" && <StatusChip status={task.status} />}
        </Box>
        <Typography noWrap sx={{ fontSize: 11.5, color: wsColors.muted }}>
          {sqftLabel
            ? `${task.who} · ${sqftLabel}`
            : `${task.who} · paid ${paidPct}% · work ${workTxt}`}
        </Typography>
      </Box>
      <MiniDualProgressBar paidPct={task.paidPctOfQuoted} workPct={task.work} width={46} height={8} />
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

/**
 * Stage header with inline rename + two-tap delete (admin only). Rendered once
 * per stage so the rename/delete hooks have a stable call site (no hooks-in-a-loop).
 * Delete is FK-safe — task works fall back to "Ungrouped" (subcontracts.stage_id
 * is ON DELETE SET NULL).
 */
function StageHeaderActions({
  siteId,
  tradeCategoryId,
  stage,
  canEdit,
}: {
  siteId: string;
  tradeCategoryId: string;
  stage: WorkStage;
  canEdit: boolean;
}) {
  const updateStage = useUpdateWorkStage(siteId, tradeCategoryId);
  const deleteStage = useDeleteWorkStage(siteId, tradeCategoryId);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stage.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = () => {
    const next = name.trim();
    if (next && next !== stage.name) {
      void updateStage.mutateAsync({ id: stage.id, patch: { name: next } });
    }
    setEditing(false);
  };
  const cancel = () => {
    setName(stage.name);
    setEditing(false);
  };

  if (editing) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 1.25, mb: 0.25 }}>
        <InputBase
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") cancel();
          }}
          sx={{
            flex: 1,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: ".04em",
            textTransform: "uppercase",
            color: wsColors.ink,
            border: `1px solid ${wsColors.hairline}`,
            borderRadius: `${wsRadius.input}px`,
            px: 0.75,
            py: 0.1,
          }}
        />
        <IconButton size="small" onMouseDown={(e) => e.preventDefault()} onClick={save} sx={{ p: 0.25 }}>
          <Check sx={{ fontSize: 15, color: wsColors.green }} />
        </IconButton>
        <IconButton size="small" onMouseDown={(e) => e.preventDefault()} onClick={cancel} sx={{ p: 0.25 }}>
          <Close sx={{ fontSize: 15, color: wsColors.muted }} />
        </IconButton>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.25,
        px: 1.25,
        mb: 0.25,
        "&:hover .stage-actions": { opacity: 1 },
      }}
    >
      <Typography sx={{ ...SECTION_LABEL_SX, px: 0, mb: 0, flex: 1, minWidth: 0 }} noWrap>
        {stage.name}
      </Typography>
      {canEdit && (
        <Box
          className="stage-actions"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.25,
            opacity: { xs: 1, md: 0.3 },
            transition: "opacity .15s",
          }}
        >
          <Tooltip title="Rename stage">
            <IconButton
              size="small"
              onClick={() => {
                setName(stage.name);
                setEditing(true);
              }}
              sx={{ p: 0.25 }}
            >
              <EditOutlined sx={{ fontSize: 14, color: wsColors.muted }} />
            </IconButton>
          </Tooltip>
          {confirmDelete ? (
            <Tooltip title="Tap again to delete this stage (task work stays, just ungrouped)">
              <IconButton
                size="small"
                onClick={() => {
                  void deleteStage.mutateAsync(stage.id);
                  setConfirmDelete(false);
                }}
                sx={{ p: 0.25 }}
              >
                <DeleteOutline sx={{ fontSize: 14, color: wsColors.red }} />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title="Delete stage">
              <IconButton size="small" onClick={() => setConfirmDelete(true)} sx={{ p: 0.25 }}>
                <DeleteOutline sx={{ fontSize: 14, color: wsColors.muted }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}
    </Box>
  );
}

/**
 * Inline "Add stage" affordance for a trade. Stages were previously only creatable
 * from inside the "Add task work" dialog — this surfaces it directly in the tree so
 * floors/phases can be organised without creating a task work first.
 */
function AddStageInline({
  siteId,
  tradeCategoryId,
  nextSortOrder,
}: {
  siteId: string;
  tradeCategoryId: string;
  nextSortOrder: number;
}) {
  const addStage = useAddWorkStage(siteId, tradeCategoryId);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");

  const save = () => {
    const next = name.trim();
    if (next) void addStage.mutateAsync({ name: next, sortOrder: nextSortOrder });
    setName("");
    setEditing(false);
  };
  const cancel = () => {
    setName("");
    setEditing(false);
  };

  if (editing) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 1.25, py: 0.25, mt: 0.25 }}>
        <InputBase
          autoFocus
          value={name}
          placeholder="New stage name (e.g. First Floor)"
          onChange={(e) => setName(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") cancel();
          }}
          sx={{
            flex: 1,
            fontSize: 12,
            color: wsColors.ink,
            border: `1px solid ${wsColors.hairline}`,
            borderRadius: `${wsRadius.input}px`,
            px: 0.75,
            py: 0.25,
          }}
        />
        <IconButton size="small" onMouseDown={(e) => e.preventDefault()} onClick={save} sx={{ p: 0.25 }}>
          <Check sx={{ fontSize: 15, color: wsColors.green }} />
        </IconButton>
        <IconButton size="small" onMouseDown={(e) => e.preventDefault()} onClick={cancel} sx={{ p: 0.25 }}>
          <Close sx={{ fontSize: 15, color: wsColors.muted }} />
        </IconButton>
      </Box>
    );
  }

  return (
    <Button
      size="small"
      startIcon={<Add sx={{ fontSize: 16 }} />}
      onClick={() => setEditing(true)}
      sx={{ ml: 0.5, mt: 0.25, textTransform: "none", color: wsColors.muted, fontWeight: 700 }}
    >
      Add stage
    </Button>
  );
}

export function ContractTree({
  siteId,
  canEdit,
  trades,
  selectedTaskId,
  onSelectTask,
  selectedGroupKey,
  onSelectGroup,
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
  /** Selection key of the open "combined contract" (contractor group), or null. */
  selectedGroupKey: string | null;
  onSelectGroup: (key: string) => void;
  openTrades: Record<string, boolean>;
  onToggleTrade: (categoryId: string) => void;
  query: string;
  /** Which lifecycle bucket the tree is filtered to (Future / Active / Completed). */
  activeTab: StatusTab;
  packagesByTrade: Map<string, TaskWorkPackageWithMeta[]>;
  onOpenPackage: (pkg: TaskWorkPackageWithMeta) => void;
  onAddTaskWork: (
    tradeCategoryId: string,
    stageId: string | null,
    initialStatus?: "draft" | "active"
  ) => void;
}) {
  const q = query.trim().toLowerCase();
  // A leaf is visible when it falls in the active tab AND matches the search.
  const taskVisible = (t: WorkspaceTask) =>
    statusBucket(t.status) === activeTab && matchesQuery(t, q);
  const pkgVisible = (p: TaskWorkPackageWithMeta) =>
    statusBucket(p.status) === activeTab && pkgMatchesQuery(p, q);
  // Adding / planning work doesn't belong on the Completed tab.
  const showAddAffordances = activeTab !== "completed";
  // New work created from the Future tab starts as a draft (planned); else active.
  const addStatus: "draft" | "active" = activeTab === "future" ? "draft" : "active";
  // Contractor groups default to expanded; the user can collapse them to a single line.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (k: string) =>
    setOpenGroups((p) => ({ ...p, [k]: !(p[k] ?? true) }));
  // Trades with no task work yet collapse into one footer so the active work is
  // easy to scan. null = auto: open only when nothing is active (e.g. new site).
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
        const sev = rollupSeverity(node.rollup);
        const Trade = tradeIcon(node.category.name);

        // Attach carve-out packages to the contractor group that owns their
        // parent subcontract (e.g. the Saroja plastering under Jithin). Packages
        // whose parent isn't in a contractor group stay in the trade's list.
        const taskIdToGroupKey = new Map<string, string>();
        for (const g of node.contractorGroups)
          for (const t of g.tasks) taskIdToGroupKey.set(t.id, g.key);
        const pkgsByGroup = new Map<string, TaskWorkPackageWithMeta[]>();
        const attachedIds = new Set<string>();
        for (const p of pkgs) {
          const gk = p.parent_subcontract_id
            ? taskIdToGroupKey.get(p.parent_subcontract_id)
            : undefined;
          if (gk) {
            const arr = pkgsByGroup.get(gk) ?? [];
            arr.push(p);
            pkgsByGroup.set(gk, arr);
            attachedIds.add(p.id);
          }
        }
        // Attach packages whose parent subcontract IS a real parent contract (or one of
        // its children) under that parent's expansion.
        const pkgsByParentId = new Map<string, TaskWorkPackageWithMeta[]>();
        for (const pc of node.parentContracts) {
          const ids = new Set<string>([pc.parent.id, ...pc.children.map((c) => c.id)]);
          for (const p of pkgs) {
            if (attachedIds.has(p.id)) continue;
            if (p.parent_subcontract_id && ids.has(p.parent_subcontract_id)) {
              const arr = pkgsByParentId.get(pc.parent.id) ?? [];
              arr.push(p);
              pkgsByParentId.set(pc.parent.id, arr);
              attachedIds.add(p.id);
            }
          }
        }
        const loosePkgs = pkgs.filter((p) => !attachedIds.has(p.id));
        const filteredLoosePkgs = loosePkgs.filter(pkgVisible);

        const hasOtherGroups =
          node.stageGroups.length > 0 ||
          node.contractorGroups.length > 0 ||
          node.parentContracts.length > 0;

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
              {node.rollup.trackedCount > 0 && (
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
              )}
              <SeverityDot severity={sev} size={9} />
            </Box>

            <Collapse in={open} unmountOnExit>
              <Box sx={{ pl: 2, pr: 0.5, pb: 0.5 }}>
                {/* Real parent contracts (named, with floor children) */}
                {node.parentContracts.map((pc) => {
                  const shownChildren = pc.children.filter(taskVisible);
                  const attachedPkgs = pkgsByParentId.get(pc.parent.id) ?? [];
                  const shownPkgs = attachedPkgs.filter(pkgVisible);
                  // Leaves visible in this tab; the parent row is just their container.
                  const leafCount = shownChildren.length + shownPkgs.length;
                  if (leafCount === 0) return null;
                  const totalParts = pc.children.length + attachedPkgs.length;
                  const pKey = `parent:${pc.parent.id}`;
                  const pOpen = q ? true : openGroups[pKey] ?? false;
                  const pSelected = selectedTaskId === pc.parent.id;
                  const psev = rollupSeverity(pc.rollup);
                  return (
                    <Box key={pc.parent.id} sx={{ mt: 0.5 }}>
                      <Box
                        onClick={() => onSelectTask(pc.parent.id)}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 0.5,
                          px: 1,
                          py: 0.6,
                          borderRadius: `${wsRadius.row}px`,
                          cursor: "pointer",
                          border: `1px solid ${pSelected ? "#d3e0fb" : "transparent"}`,
                          bgcolor: pSelected ? wsColors.primaryTint : "transparent",
                          "&:hover": { bgcolor: pSelected ? wsColors.primaryTint : wsColors.canvas },
                        }}
                      >
                        {/* Chevron is its own hit-area: toggle collapse without selecting. */}
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleGroup(pKey);
                          }}
                          sx={{ p: 0.25, ml: -0.25 }}
                        >
                          <ChevronRight
                            sx={{
                              fontSize: 18,
                              color: wsColors.muted,
                              transition: "transform .18s ease",
                              transform: pOpen ? "rotate(90deg)" : "none",
                            }}
                          />
                        </IconButton>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography
                            noWrap
                            sx={{
                              fontSize: 13,
                              fontWeight: 800,
                              color: pSelected ? wsColors.primary : wsColors.ink,
                              letterSpacing: "-.01em",
                            }}
                          >
                            {pc.parent.title}
                          </Typography>
                          <Typography noWrap sx={{ fontSize: 11, color: wsColors.muted }}>
                            {pc.parent.who} · {totalParts} part
                            {totalParts === 1 ? "" : "s"} · {formatCompactINR(pc.rollup.quoted)}
                          </Typography>
                        </Box>
                        {pc.rollup.trackedCount > 0 && (
                          <MiniDualProgressBar
                            paidPct={
                              pc.rollup.quotedTracked > 0
                                ? pc.rollup.paidTracked / pc.rollup.quotedTracked
                                : 0
                            }
                            workPct={
                              pc.rollup.quotedTracked > 0
                                ? pc.rollup.workValue / pc.rollup.quotedTracked
                                : 0
                            }
                            width={40}
                            height={7}
                          />
                        )}
                        <SeverityDot severity={psev} size={8} />
                      </Box>
                      <Collapse in={pOpen} unmountOnExit>
                        <Box sx={{ pt: 0.25 }}>
                          {shownChildren.map((t, i) => (
                            <TreeBranch key={t.id} isLast={i === leafCount - 1}>
                              <TaskRow
                                task={t}
                                selected={t.id === selectedTaskId}
                                onSelect={() => onSelectTask(t.id)}
                              />
                            </TreeBranch>
                          ))}
                          {shownPkgs.map((p, j) => (
                            <TreeBranch
                              key={p.id}
                              isLast={shownChildren.length + j === leafCount - 1}
                            >
                              <PackageRow pkg={p} onOpen={() => onOpenPackage(p)} />
                            </TreeBranch>
                          ))}
                        </Box>
                      </Collapse>
                    </Box>
                  );
                })}

                {/* Stage groups */}
                {node.stageGroups.map(({ stage, tasks }) => {
                  const shown = tasks.filter(taskVisible);
                  if (shown.length === 0) return null;
                  return (
                    <Box key={stage.id} sx={{ mt: 0.5 }}>
                      <StageHeaderActions
                        siteId={siteId}
                        tradeCategoryId={node.category.id}
                        stage={stage}
                        canEdit={canEdit}
                      />
                      {shown.map((t) => (
                        <TaskRow
                          key={t.id}
                          task={t}
                          selected={t.id === selectedTaskId}
                          onSelect={() => onSelectTask(t.id)}
                        />
                      ))}
                      {!q && showAddAffordances && (
                        <Button
                          size="small"
                          startIcon={<Add sx={{ fontSize: 16 }} />}
                          onClick={() => onAddTaskWork(node.category.id, stage.id, addStatus)}
                          sx={{ ml: 0.5, mt: 0.25, textTransform: "none", color: wsColors.primary }}
                        >
                          Add task work
                        </Button>
                      )}
                    </Box>
                  );
                })}

                {/* Add a stage directly (no need to create a task work first) */}
                {canEdit && !q && showAddAffordances && (
                  <AddStageInline
                    siteId={siteId}
                    tradeCategoryId={node.category.id}
                    nextSortOrder={node.stageGroups.length}
                  />
                )}

                {/* Contractor groups — a crew's task works shown as one contract */}
                {node.contractorGroups.map((group) => {
                  const shownTasks = group.tasks.filter(taskVisible);
                  const attachedPkgs = pkgsByGroup.get(group.key) ?? [];
                  const shownPkgs = attachedPkgs.filter(pkgVisible);
                  if (shownTasks.length === 0 && shownPkgs.length === 0) return null;
                  const gLeafCount = shownTasks.length + shownPkgs.length;
                  const groupKey = `${node.category.id}::${group.key}`;
                  const groupOpen = q ? true : openGroups[groupKey] ?? true;
                  const groupSelected = selectedGroupKey === groupKey;
                  const gsev = rollupSeverity(group.rollup);
                  return (
                    <Box key={group.key} sx={{ mt: 0.5 }}>
                      <Box
                        onClick={() => onSelectGroup(groupKey)}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 0.5,
                          px: 1,
                          py: 0.6,
                          borderRadius: `${wsRadius.row}px`,
                          cursor: "pointer",
                          border: `1px solid ${groupSelected ? "#d3e0fb" : "transparent"}`,
                          bgcolor: groupSelected ? wsColors.primaryTint : "transparent",
                          "&:hover": { bgcolor: groupSelected ? wsColors.primaryTint : wsColors.canvas },
                        }}
                      >
                        {/* Chevron is its own hit-area: toggle collapse without selecting. */}
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleGroup(groupKey);
                          }}
                          sx={{ p: 0.25, ml: -0.25 }}
                        >
                          <ChevronRight
                            sx={{
                              fontSize: 18,
                              color: wsColors.muted,
                              transition: "transform .18s ease",
                              transform: groupOpen ? "rotate(90deg)" : "none",
                            }}
                          />
                        </IconButton>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography
                            noWrap
                            sx={{
                              fontSize: 13,
                              fontWeight: 800,
                              color: groupSelected ? wsColors.primary : wsColors.ink,
                              letterSpacing: "-.01em",
                            }}
                          >
                            {group.who}
                          </Typography>
                          <Typography noWrap sx={{ fontSize: 11, color: wsColors.muted }}>
                            {group.tasks.length} works · {formatCompactINR(group.rollup.quoted)}
                          </Typography>
                        </Box>
                        {group.rollup.trackedCount > 0 && (
                          <MiniDualProgressBar
                            paidPct={
                              group.rollup.quotedTracked > 0
                                ? group.rollup.paidTracked / group.rollup.quotedTracked
                                : 0
                            }
                            workPct={
                              group.rollup.quotedTracked > 0
                                ? group.rollup.workValue / group.rollup.quotedTracked
                                : 0
                            }
                            width={40}
                            height={7}
                          />
                        )}
                        <SeverityDot severity={gsev} size={8} />
                      </Box>
                      <Collapse in={groupOpen} unmountOnExit>
                        <Box sx={{ pt: 0.25 }}>
                          {shownTasks.map((t, i) => (
                            <TreeBranch key={t.id} isLast={i === gLeafCount - 1}>
                              <TaskRow
                                task={t}
                                selected={t.id === selectedTaskId}
                                onSelect={() => onSelectTask(t.id)}
                              />
                            </TreeBranch>
                          ))}
                          {shownPkgs.map((p, j) => (
                            <TreeBranch
                              key={p.id}
                              isLast={shownTasks.length + j === gLeafCount - 1}
                            >
                              <PackageRow pkg={p} onOpen={() => onOpenPackage(p)} />
                            </TreeBranch>
                          ))}
                        </Box>
                      </Collapse>
                    </Box>
                  );
                })}

                {/* Ungrouped (single-contractor) tasks */}
                {(() => {
                  const shown = node.ungrouped.filter(taskVisible);
                  if (shown.length === 0) return null;
                  return (
                    <Box sx={{ mt: 0.5 }}>
                      {hasOtherGroups && (
                        <Typography sx={SECTION_LABEL_SX}>Ungrouped</Typography>
                      )}
                      {shown.map((t) => (
                        <TaskRow
                          key={t.id}
                          task={t}
                          selected={t.id === selectedTaskId}
                          onSelect={() => onSelectTask(t.id)}
                        />
                      ))}
                    </Box>
                  );
                })()}

                {/* Loose fixed-price packages (not attached to a contractor group) */}
                {filteredLoosePkgs.length > 0 && (
                  <Box sx={{ mt: 0.75 }}>
                    <Typography sx={SECTION_LABEL_SX}>Fixed-price packages</Typography>
                    {filteredLoosePkgs.map((p) => (
                      <PackageRow key={p.id} pkg={p} onOpen={() => onOpenPackage(p)} />
                    ))}
                  </Box>
                )}

                {/* Empty trade prompt — the trade is the contract, so the first
                    action is to set up the whole-scope job, not a "small task". */}
                {count === 0 && !q && showAddAffordances && (
                  <Button
                    size="small"
                    startIcon={<Add sx={{ fontSize: 16 }} />}
                    onClick={() => onAddTaskWork(node.category.id, null, addStatus)}
                    sx={{ ml: 0.5, mt: 0.25, textTransform: "none", color: wsColors.primary }}
                  >
                    {activeTab === "future" ? "Plan" : "Set up"} {node.category.name} contract
                  </Button>
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
        : "no task work yet";

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
