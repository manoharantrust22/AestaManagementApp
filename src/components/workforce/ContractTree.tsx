"use client";

import { useMemo, useState } from "react";
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
  tradeIcon,
  wsColors,
  wsRadius,
} from "@/lib/workforce/workspaceTokens";
import type { Severity } from "@/lib/workforce/exposure";
import type { WorkStage } from "@/types/trade.types";
import { TASK_WORK_STATUS_LABEL, type TaskWorkPackageWithMeta } from "@/types/taskWork.types";
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
        <Typography
          noWrap
          sx={{
            fontSize: 13.5,
            fontWeight: selected ? 800 : 600,
            color: selected ? wsColors.primary : wsColors.ink,
            letterSpacing: "-.01em",
          }}
        >
          {task.title}
        </Typography>
        <Typography noWrap sx={{ fontSize: 11.5, color: wsColors.muted }}>
          {task.who} · paid {paidPct}% · work {workTxt}
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
        <Typography noWrap sx={{ fontSize: 11.5, color: wsColors.muted }}>
          {pkg.maistry_name ?? "—"} · {TASK_WORK_STATUS_LABEL[pkg.status]}
        </Typography>
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
  packagesByTrade: Map<string, TaskWorkPackageWithMeta[]>;
  onOpenPackage: (pkg: TaskWorkPackageWithMeta) => void;
  onAddTaskWork: (tradeCategoryId: string, stageId: string | null) => void;
}) {
  const q = query.trim().toLowerCase();
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
        const count = node.tasks.length + pkgs.length;
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
        const filteredLoosePkgs = q
          ? loosePkgs.filter((p) => pkgMatchesQuery(p, q))
          : loosePkgs;

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
                  const shownChildren = q
                    ? pc.children.filter((t) => matchesQuery(t, q))
                    : pc.children;
                  const parentMatches = q
                    ? matchesQuery(pc.parent, q) || shownChildren.length > 0
                    : true;
                  if (!parentMatches) return null;
                  const attachedPkgs = pkgsByParentId.get(pc.parent.id) ?? [];
                  const shownPkgs = q
                    ? attachedPkgs.filter((p) => pkgMatchesQuery(p, q))
                    : attachedPkgs;
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
                            {pc.parent.who} · {pc.children.length} floor
                            {pc.children.length === 1 ? "" : "s"} · {formatCompactINR(pc.rollup.quoted)}
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
                        <Box sx={{ pl: 1.5 }}>
                          {shownChildren.length > 0 ? (
                            shownChildren.map((t) => (
                              <TaskRow
                                key={t.id}
                                task={t}
                                selected={t.id === selectedTaskId}
                                onSelect={() => onSelectTask(t.id)}
                              />
                            ))
                          ) : (
                            <Typography sx={{ ...SECTION_LABEL_SX, px: 1.25, py: 0.5 }}>
                              No floors listed
                            </Typography>
                          )}
                          {shownPkgs.length > 0 && (
                            <Box sx={{ mt: 0.25 }}>
                              <Typography
                                sx={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  letterSpacing: ".04em",
                                  textTransform: "uppercase",
                                  color: wsColors.muted2,
                                  px: 1.25,
                                  mb: 0.1,
                                }}
                              >
                                Carved-out lump-sum
                              </Typography>
                              {shownPkgs.map((p) => (
                                <PackageRow key={p.id} pkg={p} onOpen={() => onOpenPackage(p)} />
                              ))}
                            </Box>
                          )}
                        </Box>
                      </Collapse>
                    </Box>
                  );
                })}

                {/* Stage groups */}
                {node.stageGroups.map(({ stage, tasks }) => {
                  const shown = q ? tasks.filter((t) => matchesQuery(t, q)) : tasks;
                  if (q && shown.length === 0) return null;
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
                      {!q && (
                        <Button
                          size="small"
                          startIcon={<Add sx={{ fontSize: 16 }} />}
                          onClick={() => onAddTaskWork(node.category.id, stage.id)}
                          sx={{ ml: 0.5, mt: 0.25, textTransform: "none", color: wsColors.primary }}
                        >
                          Add task work
                        </Button>
                      )}
                    </Box>
                  );
                })}

                {/* Add a stage directly (no need to create a task work first) */}
                {canEdit && !q && (
                  <AddStageInline
                    siteId={siteId}
                    tradeCategoryId={node.category.id}
                    nextSortOrder={node.stageGroups.length}
                  />
                )}

                {/* Contractor groups — a crew's task works shown as one contract */}
                {node.contractorGroups.map((group) => {
                  const shownTasks = q
                    ? group.tasks.filter((t) => matchesQuery(t, q))
                    : group.tasks;
                  const attachedPkgs = pkgsByGroup.get(group.key) ?? [];
                  const shownPkgs = q
                    ? attachedPkgs.filter((p) => pkgMatchesQuery(p, q))
                    : attachedPkgs;
                  if (q && shownTasks.length === 0 && shownPkgs.length === 0) return null;
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
                        <Box sx={{ pl: 1.5 }}>
                          {shownTasks.map((t) => (
                            <TaskRow
                              key={t.id}
                              task={t}
                              selected={t.id === selectedTaskId}
                              onSelect={() => onSelectTask(t.id)}
                            />
                          ))}
                          {shownPkgs.length > 0 && (
                            <Box sx={{ mt: 0.25 }}>
                              <Typography
                                sx={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  letterSpacing: ".04em",
                                  textTransform: "uppercase",
                                  color: wsColors.muted2,
                                  px: 1.25,
                                  mb: 0.1,
                                }}
                              >
                                Carved-out lump-sum
                              </Typography>
                              {shownPkgs.map((p) => (
                                <PackageRow
                                  key={p.id}
                                  pkg={p}
                                  onOpen={() => onOpenPackage(p)}
                                />
                              ))}
                            </Box>
                          )}
                        </Box>
                      </Collapse>
                    </Box>
                  );
                })}

                {/* Ungrouped (single-contractor) tasks */}
                {(() => {
                  const shown = q
                    ? node.ungrouped.filter((t) => matchesQuery(t, q))
                    : node.ungrouped;
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
                {count === 0 && !q && (
                  <Button
                    size="small"
                    startIcon={<Add sx={{ fontSize: 16 }} />}
                    onClick={() => onAddTaskWork(node.category.id, null)}
                    sx={{ ml: 0.5, mt: 0.25, textTransform: "none", color: wsColors.primary }}
                  >
                    Set up {node.category.name} contract
                  </Button>
                )}
              </Box>
            </Collapse>
          </Box>
        );
  };

  const tradeCount = (n: TradeNode) =>
    n.tasks.length + (packagesByTrade.get(n.category.id)?.length ?? 0);
  const activeTrades = visibleTrades.filter((n) => tradeCount(n) > 0);
  const emptyTrades = visibleTrades.filter((n) => tradeCount(n) === 0);
  const emptyOpen = emptyOpenRaw ?? activeTrades.length === 0;

  return (
    <Box>
      {activeTrades.map(renderNode)}
      {!q && emptyTrades.length > 0 && (
        <Box sx={{ mt: 0.75 }}>
          <Box
            onClick={() =>
              setEmptyOpen((o) => !(o ?? activeTrades.length === 0))
            }
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
              {emptyTrades.length === 1 ? "trade" : "trades"} · no task work yet
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
