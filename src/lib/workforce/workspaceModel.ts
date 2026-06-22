/**
 * Workforce Workspace view model.
 *
 * Joins the existing server state (useSiteTrades + useSiteTradeReconciliations +
 * useSiteTradeActivity) into the shape the redesigned Workspace renders: a
 * **Trade ▸ Contract ▸ Section ▸ Task** ladder. Every `subcontracts` row is a node;
 * its tier is its depth in the `parent_subcontract_id` chain (root = Contract,
 * child = Section, grandchild = Task). Each node carries its exposure verdict plus a
 * de-duped roll-up (a parent's value counts once — its own leftover plus each child).
 *
 * Pure (no React) so it's unit-testable. Components feed it query results.
 * Legacy `task_work_packages` are NOT modelled here — they stay a separate list the
 * tree attaches at render time by `parent_subcontract_id`, with their own drawer.
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
  /** Set when this row is a CHILD of another subcontract (its parent in the ladder). Null = top-level Contract. */
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

/**
 * Where a node sits in the Contract ▸ Section ▸ Task ladder, derived from its depth in
 * the `parent_subcontract_id` chain. Contracts hold Sections; Sections hold Tasks. Any
 * node may be a leaf (a simple one-shot Contract has no Sections).
 */
export type ContractTier = "contract" | "section" | "task";

/**
 * A node in a Contract's recursive subtree. Backed by a real, editable `subcontracts`
 * row. `rollup` folds this node's own leftover value together with every descendant so
 * a parent is counted exactly once.
 */
export interface ContractNode {
  task: WorkspaceTask;
  tier: ContractTier;
  children: ContractNode[];
  rollup: RollupResult;
}

/**
 * A presentation-only "combined contract" shape ({ who, the parts, the rollup }) that the
 * `GroupDetailPane` renders. Built on demand from a `ContractNode` that has children — it
 * is NOT part of the trade tree.
 */
export interface ContractorGroup {
  key: string;
  who: string;
  tasks: WorkspaceTask[];
  rollup: RollupResult;
}

export interface TradeNode {
  category: TradeCategory;
  /** Every subcontract row in this trade, flattened across all tiers (for counts / search). */
  tasks: WorkspaceTask[];
  /** Top-level Contracts (parent_subcontract_id == null), each with its recursive subtree. */
  contracts: ContractNode[];
  rollup: RollupResult;
}

export interface WorkspaceModel {
  trades: TradeNode[];
  /** Whole-site rollup over every node (de-duped — a parent counts once). */
  site: RollupResult;
  /**
   * Whole-site rollup split by status tab (Future / Active / Completed), using the
   * same de-duped inputs as `site` (each node counts once via its own leftover plus
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

const tierForDepth = (depth: number): ContractTier =>
  depth <= 0 ? "contract" : depth === 1 ? "section" : "task";

interface BuildInput {
  trades: Trade[];
  reconciliations: Map<string, ContractReconciliation> | undefined;
  activity: Map<string, ContractActivity> | undefined;
  /** Accepted for call-site compatibility; Stages are no longer rendered as a tier. */
  stages?: WorkStage[] | undefined;
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
  // Flattened rollup inputs for the whole-site total. Each node contributes ONLY its own
  // "leftover" quoted (value not covered by its direct children) plus its own paid/work —
  // so a parent's value is counted exactly once, never doubled by its children.
  const allInputs: RollupTask[] = [];
  // Same de-duped inputs, split by status tab (each input keyed to its source node's
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

    // ── Recursive Contract ▸ Section ▸ Task tree ─────────────────────────────
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const childrenByParent = new Map<string, WorkspaceTask[]>();
    for (const t of tasks) {
      if (t.parentSubcontractId && taskById.has(t.parentSubcontractId)) {
        const arr = childrenByParent.get(t.parentSubcontractId) ?? [];
        arr.push(t);
        childrenByParent.set(t.parentSubcontractId, arr);
      }
    }

    const tradeInputs: RollupTask[] = [];
    // Build a node + collect every descendant's "own" input. A node's own quoted is the
    // value not already represented by its DIRECT children, so a subtree sums to the
    // root's quoted exactly once (matches the trusted single-level parent math).
    const buildNode = (task: WorkspaceTask, depth: number): {
      node: ContractNode;
      subtreeInputs: RollupTask[];
    } => {
      const kids = childrenByParent.get(task.id) ?? [];
      const childBuilds = kids.map((k) => buildNode(k, depth + 1));
      const childQuotedSum = kids.reduce((s, k) => s + k.quoted, 0);
      const ownInput: RollupTask = {
        quoted: Math.max(0, task.quoted - childQuotedSum),
        paid: task.paid,
        work: task.work,
      };
      pushTab(task.status, ownInput);
      tradeInputs.push(ownInput);
      const subtreeInputs = [ownInput, ...childBuilds.flatMap((cb) => cb.subtreeInputs)];
      return {
        node: {
          task,
          tier: tierForDepth(depth),
          children: childBuilds.map((cb) => cb.node),
          rollup: rollupTasks(subtreeInputs),
        },
        subtreeInputs,
      };
    };

    // Roots = top-level rows, plus any orphan whose parent isn't visible in this trade
    // (so a stray child never disappears — it surfaces as its own Contract).
    const roots = tasks.filter(
      (t) => !t.parentSubcontractId || !taskById.has(t.parentSubcontractId)
    );
    const contracts = roots.map((r) => buildNode(r, 0).node);

    tradeNodes.push({
      category: trade.category,
      tasks,
      contracts,
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

/** Find a task by id across the model (for the selected detail pane). */
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
 * Find a contract node (and the trade it belongs to) by its subcontract id, anywhere in
 * the recursive tree. Powers the detail pane: a node WITH children renders the combined
 * "one contract" view; a leaf renders the single-task detail.
 */
export function findContractNode(
  model: WorkspaceModel,
  taskId: string | null
): { node: ContractNode; trade: TradeNode } | null {
  if (!taskId) return null;
  const walk = (nodes: ContractNode[]): ContractNode | null => {
    for (const n of nodes) {
      if (n.task.id === taskId) return n;
      const hit = walk(n.children);
      if (hit) return hit;
    }
    return null;
  };
  for (const trade of model.trades) {
    const node = walk(trade.contracts);
    if (node) return { node, trade };
  }
  return null;
}

/** Build the presentational "combined contract" shape from a container node's children. */
export function contractorGroupFromNode(node: ContractNode): ContractorGroup {
  return {
    key: node.task.id,
    who: node.task.who,
    tasks: node.children.map((c) => c.task),
    rollup: node.rollup,
  };
}
