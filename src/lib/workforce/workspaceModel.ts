/**
 * Workforce Workspace view model.
 *
 * Joins the existing server state (useSiteTrades + useSiteTradeReconciliations +
 * useSiteTradeActivity + useSiteWorkStages) into the shape the redesigned 3-pane
 * Workspace renders: a trade → stage → task tree, each task carrying its exposure
 * verdict, plus per-trade and whole-site rollups.
 *
 * Pure (no React) so it's unit-testable. Components feed it query results.
 * Legacy `task_work_packages` are NOT modelled here — they stay a separate list in
 * Pane B with their existing detail drawer (they have no progress / exposure).
 */
import type {
  ContractActivity,
  ContractReconciliation,
  ContractStatus,
  LaborTrackingMode,
  Trade,
  TradeCategory,
  WorkStage,
} from "@/types/trade.types";
import { computeExposure, rollupTasks, type ExposureResult, type RollupResult, type RollupTask } from "./exposure";
import { statusBucket, type StatusTab } from "./statusTabs";

export interface WorkspaceTask {
  id: string;
  tradeCategoryId: string | null;
  tradeName: string;
  stageId: string | null;
  stageName: string | null;
  title: string;
  /** Display name of the crew leader / specialist (or "In-house team"). */
  who: string;
  /** "Mesthri team" | "Specialist" | "In-house". */
  party: string;
  initials: string;
  mode: LaborTrackingMode;
  status: ContractStatus;
  isInHouse: boolean;
  teamId: string | null;
  laborerId: string | null;
  /** Set when this task is a CHILD (floor) of a real parent contract. Null = top-level. */
  parentSubcontractId: string | null;
  /** Stable key used to cluster a contractor's task works (team › laborer › name › in-house). */
  contractorKey: string;
  quoted: number;
  paid: number;
  /** Area-based pricing (when measurementUnit === "sqft"): units × rate. Null otherwise. */
  measurementUnit: string | null;
  ratePerUnit: number | null;
  totalUnits: number | null;
  /** Fraction complete 0–1, or null when not tracked. */
  work: number | null;
  workPercent: number | null;
  days: number;
  exposure: ExposureResult;
  /** paid as a fraction of quoted, clamped 0–1 (for the dual progress bar). */
  paidPctOfQuoted: number;
}

export interface StageGroup {
  stage: WorkStage;
  tasks: WorkspaceTask[];
}

/**
 * A set of task works under one trade that share a contractor (same crew/team,
 * laborer, or typed name). Surfaces "Jithin's whole construction" as one contract
 * with a combined value + roll-up, while each scope stays a separate task row.
 * Only formed when 2+ task works share the contractor; singletons stay flat.
 */
export interface ContractorGroup {
  key: string;
  who: string;
  tasks: WorkspaceTask[];
  rollup: RollupResult;
}

/**
 * A REAL parent contract (a `subcontracts` row whose children point at it via
 * `parent_subcontract_id`) plus its children. Unlike a `ContractorGroup` (a purely
 * visual cluster) this is backed by an editable DB row the owner named — e.g.
 * "Jithin Civil contract" over its floor children. The combined `rollup` folds the
 * parent's own records together with every child's (after a "move records" promotion
 * the records live on the parent and the children are empty optional tags).
 */
export interface ParentContract {
  parent: WorkspaceTask;
  children: WorkspaceTask[];
  rollup: RollupResult;
}

export interface TradeNode {
  category: TradeCategory;
  tasks: WorkspaceTask[];
  stageGroups: StageGroup[];
  /** Real named parent contracts (with their floor children) — rendered as one contract. */
  parentContracts: ParentContract[];
  /** Ungrouped (no stage) task works clustered by contractor (2+ only). */
  contractorGroups: ContractorGroup[];
  /** Ungrouped task works that don't share a contractor with any other (rendered flat). */
  ungrouped: WorkspaceTask[];
  rollup: RollupResult;
}

export interface WorkspaceModel {
  trades: TradeNode[];
  /** Whole-site rollup over every task. */
  site: RollupResult;
  /**
   * Whole-site rollup split by status tab (Future / Active / Completed), using the
   * same de-duped inputs as `site` (a parent counts once via its own leftover plus
   * each child). Powers the tab-aware summary tiles without double-counting parents.
   */
  siteByTab: Record<StatusTab, RollupResult>;
}

export function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

interface BuildInput {
  trades: Trade[];
  reconciliations: Map<string, ContractReconciliation> | undefined;
  activity: Map<string, ContractActivity> | undefined;
  stages: WorkStage[] | undefined;
}

export function buildWorkspaceModel({
  trades,
  reconciliations,
  activity,
  stages,
}: BuildInput): WorkspaceModel {
  const stageById = new Map<string, WorkStage>();
  for (const s of stages ?? []) stageById.set(s.id, s);

  const tradeNodes: TradeNode[] = [];
  // Flattened rollup inputs for the whole-site total. A parent is represented by its
  // own "leftover" quoted (value not covered by children, e.g. a hidden completed child)
  // plus each child — so a parent's value is counted exactly once, never doubled.
  const allInputs: RollupTask[] = [];
  // Same de-duped inputs, split by status tab (each input keyed to its source task's
  // status) so the tab summary tiles stay accurate. `cancelled` inputs fall out.
  const tabInputs: Record<StatusTab, RollupTask[]> = {
    future: [],
    active: [],
    completed: [],
  };
  const pushTab = (status: ContractStatus, input: RollupTask) => {
    const b = statusBucket(status);
    if (b) tabInputs[b].push(input);
  };

  for (const trade of trades) {
    const tasks: WorkspaceTask[] = trade.contracts.map((c) => {
      const rec = reconciliations?.get(c.id);
      const quoted = rec?.quotedAmount ?? c.totalValue ?? 0;
      const paid = rec?.amountPaid ?? 0;
      const work =
        c.workProgressPercent == null ? null : clamp01(c.workProgressPercent / 100);
      const act = activity?.get(c.id);
      const days = Math.max(act?.attendanceDays ?? 0, act?.paymentDays ?? 0);

      const who = c.isInHouse
        ? "In-house team"
        : c.mesthriOrSpecialistName?.trim() || "Unassigned";
      const party = c.isInHouse
        ? "In-house"
        : c.contractType === "mesthri"
          ? "Mesthri team"
          : "Specialist";

      // Cluster key: a team/laborer is the same contractor across scopes; fall
      // back to in-house, then the typed name. Two different crews never merge.
      const contractorKey = c.teamId
        ? `team:${c.teamId}`
        : c.laborerId
          ? `lab:${c.laborerId}`
          : c.isInHouse
            ? "in-house"
            : `name:${who.toLowerCase()}`;

      return {
        id: c.id,
        tradeCategoryId: c.tradeCategoryId,
        tradeName: trade.category.name,
        stageId: c.stageId,
        stageName: c.stageId ? (stageById.get(c.stageId)?.name ?? null) : null,
        title: c.title,
        who,
        party,
        initials: computeInitials(who),
        mode: c.laborTrackingMode,
        status: c.status,
        isInHouse: c.isInHouse,
        teamId: c.teamId,
        laborerId: c.laborerId,
        parentSubcontractId: c.parentSubcontractId,
        contractorKey,
        quoted,
        paid,
        measurementUnit: c.measurementUnit ?? null,
        ratePerUnit: c.ratePerUnit ?? null,
        totalUnits: c.totalUnits ?? null,
        work,
        workPercent: c.workProgressPercent,
        days,
        exposure: computeExposure({ quoted, paid, work }),
        paidPctOfQuoted: quoted > 0 ? clamp01(paid / quoted) : 0,
      };
    });

    // ── Real parent contracts ────────────────────────────────────────────────
    // A task is a PARENT when another task names it via `parentSubcontractId` AND
    // that parent row is itself visible here. Its children are folded under it and
    // removed from the normal stage/contractor flow (they show only as "parts").
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const childrenByParent = new Map<string, WorkspaceTask[]>();
    for (const t of tasks) {
      if (t.parentSubcontractId && taskById.has(t.parentSubcontractId)) {
        const arr = childrenByParent.get(t.parentSubcontractId) ?? [];
        arr.push(t);
        childrenByParent.set(t.parentSubcontractId, arr);
      }
    }
    const parentContracts: ParentContract[] = [];
    const consumed = new Set<string>();
    const tradeInputs: RollupTask[] = [];
    for (const t of tasks) {
      const children = childrenByParent.get(t.id);
      if (!children || children.length === 0) continue;
      const sumChildrenQuoted = children.reduce((s, c) => s + c.quoted, 0);
      // Parent's "own" share = value not already represented by visible children
      // (e.g. a completed child hidden from the tree). Keeps quoted counted once.
      const ownInput: RollupTask = {
        quoted: Math.max(0, t.quoted - sumChildrenQuoted),
        paid: t.paid,
        work: t.work,
      };
      const childInputs: RollupTask[] = children.map((c) => ({
        quoted: c.quoted,
        paid: c.paid,
        work: c.work,
      }));
      parentContracts.push({
        parent: t,
        children,
        rollup: rollupTasks([ownInput, ...childInputs]),
      });
      consumed.add(t.id);
      for (const c of children) consumed.add(c.id);
      tradeInputs.push(ownInput, ...childInputs);
      pushTab(t.status, ownInput);
      children.forEach((c, i) => pushTab(c.status, childInputs[i]));
    }

    // Everything not folded into a parent flows through the normal stage/contractor view.
    const normalTasks = tasks.filter((t) => !consumed.has(t.id));
    for (const t of normalTasks) {
      const input: RollupTask = { quoted: t.quoted, paid: t.paid, work: t.work };
      tradeInputs.push(input);
      pushTab(t.status, input);
    }

    // Group by stage. Known stages keep their order; the rest fall into "ungrouped".
    const tradeStages = (stages ?? [])
      .filter((s) => s.tradeCategoryId === trade.category.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const byStage = new Map<string, WorkspaceTask[]>();
    const stagelessTasks: WorkspaceTask[] = [];
    const knownStageIds = new Set(tradeStages.map((s) => s.id));
    for (const t of normalTasks) {
      if (t.stageId && knownStageIds.has(t.stageId)) {
        const arr = byStage.get(t.stageId) ?? [];
        arr.push(t);
        byStage.set(t.stageId, arr);
      } else {
        stagelessTasks.push(t);
      }
    }

    // Cluster the stageless tasks by contractor, preserving first-seen order.
    // A key with 2+ tasks becomes a contractor group; singletons stay flat.
    const byContractor = new Map<string, WorkspaceTask[]>();
    const contractorOrder: string[] = [];
    for (const t of stagelessTasks) {
      if (!byContractor.has(t.contractorKey)) contractorOrder.push(t.contractorKey);
      const arr = byContractor.get(t.contractorKey) ?? [];
      arr.push(t);
      byContractor.set(t.contractorKey, arr);
    }
    const contractorGroups: ContractorGroup[] = [];
    const ungrouped: WorkspaceTask[] = [];
    for (const key of contractorOrder) {
      const groupTasks = byContractor.get(key)!;
      if (groupTasks.length >= 2) {
        contractorGroups.push({
          key,
          who: groupTasks[0].who,
          tasks: groupTasks,
          rollup: rollupTasks(
            groupTasks.map((t) => ({ quoted: t.quoted, paid: t.paid, work: t.work }))
          ),
        });
      } else {
        ungrouped.push(...groupTasks);
      }
    }

    tradeNodes.push({
      category: trade.category,
      tasks,
      stageGroups: tradeStages.map((stage) => ({
        stage,
        tasks: byStage.get(stage.id) ?? [],
      })),
      parentContracts,
      contractorGroups,
      ungrouped,
      // De-duplicated inputs (parent counted once via own-leftover + children).
      rollup: rollupTasks(tradeInputs),
    });

    allInputs.push(...tradeInputs);
  }

  return {
    trades: tradeNodes,
    site: rollupTasks(allInputs),
    siteByTab: {
      future: rollupTasks(tabInputs.future),
      active: rollupTasks(tabInputs.active),
      completed: rollupTasks(tabInputs.completed),
    },
  };
}

/** Find a task by id across the model (for the selected-task detail pane). */
export function findTask(
  model: WorkspaceModel,
  taskId: string | null
): WorkspaceTask | null {
  if (!taskId) return null;
  for (const node of model.trades) {
    const hit = node.tasks.find((t) => t.id === taskId);
    if (hit) return hit;
  }
  return null;
}

/**
 * A contractor group's `key` (e.g. "in-house", "name:asis") can repeat across
 * trades, so the selection key qualifies it by trade category. Split point is the
 * first "::" — category ids are uuids and group keys use single colons, so neither
 * side contains "::".
 */
export function groupSelectionKey(tradeCategoryId: string, groupKey: string): string {
  return `${tradeCategoryId}::${groupKey}`;
}

/**
 * Find a contractor group (and the trade node it belongs to) by its selection key.
 * Powers the "combined contract" detail pane when a group header is clicked.
 */
export function findGroup(
  model: WorkspaceModel,
  selectionKey: string | null
): { group: ContractorGroup; node: TradeNode } | null {
  if (!selectionKey) return null;
  const sep = selectionKey.indexOf("::");
  if (sep === -1) return null;
  const categoryId = selectionKey.slice(0, sep);
  const groupKey = selectionKey.slice(sep + 2);
  const node = model.trades.find((n) => n.category.id === categoryId);
  if (!node) return null;
  const group = node.contractorGroups.find((g) => g.key === groupKey);
  if (!group) return null;
  return { group, node };
}

/**
 * Find a REAL parent contract by its (real subcontract) id. Selecting a parent uses
 * the normal `selectedTaskId` — the layout calls this to decide whether to render the
 * combined parent view (vs a single task detail).
 */
export function findParentContract(
  model: WorkspaceModel,
  taskId: string | null
): { parentContract: ParentContract; node: TradeNode } | null {
  if (!taskId) return null;
  for (const node of model.trades) {
    const hit = node.parentContracts.find((p) => p.parent.id === taskId);
    if (hit) return { parentContract: hit, node };
  }
  return null;
}
