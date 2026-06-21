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
import { computeExposure, rollupTasks, type ExposureResult, type RollupResult } from "./exposure";

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
  /** Stable key used to cluster a contractor's task works (team › laborer › name › in-house). */
  contractorKey: string;
  quoted: number;
  paid: number;
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

export interface TradeNode {
  category: TradeCategory;
  tasks: WorkspaceTask[];
  stageGroups: StageGroup[];
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
  const allTasks: WorkspaceTask[] = [];

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
        contractorKey,
        quoted,
        paid,
        work,
        workPercent: c.workProgressPercent,
        days,
        exposure: computeExposure({ quoted, paid, work }),
        paidPctOfQuoted: quoted > 0 ? clamp01(paid / quoted) : 0,
      };
    });

    // Group by stage. Known stages keep their order; the rest fall into "ungrouped".
    const tradeStages = (stages ?? [])
      .filter((s) => s.tradeCategoryId === trade.category.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const byStage = new Map<string, WorkspaceTask[]>();
    const stagelessTasks: WorkspaceTask[] = [];
    const knownStageIds = new Set(tradeStages.map((s) => s.id));
    for (const t of tasks) {
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
      contractorGroups,
      ungrouped,
      rollup: rollupTasks(tasks.map((t) => ({ quoted: t.quoted, paid: t.paid, work: t.work }))),
    });

    allTasks.push(...tasks);
  }

  return {
    trades: tradeNodes,
    site: rollupTasks(
      allTasks.map((t) => ({ quoted: t.quoted, paid: t.paid, work: t.work }))
    ),
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
