/**
 * Decide what happens when an admin tries to delete a trade (labor_categories row).
 *
 * - System-seed trades (Civil, Electrical, …) can never be deleted — only disabled.
 * - A custom trade that is referenced anywhere (laborers, roles, contracts, task-work
 *   packages, teams) can't be hard-deleted either; offer "disable instead".
 * - Only an unused custom trade can be permanently removed.
 *
 * Pure so the branching is unit-testable without Supabase.
 */
export interface TradeDeleteRefs {
  laborers: number;
  roles: number;
  subcontracts: number;
  packages: number;
  teams: number;
}

export type TradeDeleteAction = "delete" | "disable" | "blocked-system";

export interface TradeDeleteDecision {
  action: TradeDeleteAction;
  /** Human-readable references that block a hard delete (empty for "delete"/"blocked-system"). */
  blockers: string[];
}

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

export function decideTradeDelete(
  input: { isSystemSeed: boolean } & TradeDeleteRefs
): TradeDeleteDecision {
  if (input.isSystemSeed) return { action: "blocked-system", blockers: [] };

  const blockers: string[] = [];
  if (input.laborers > 0) blockers.push(count(input.laborers, "laborer", "laborers"));
  if (input.roles > 0) blockers.push(count(input.roles, "role", "roles"));
  if (input.subcontracts > 0) blockers.push(count(input.subcontracts, "contract", "contracts"));
  if (input.packages > 0) blockers.push(count(input.packages, "task-work package", "task-work packages"));
  if (input.teams > 0) blockers.push(count(input.teams, "team", "teams"));

  return { action: blockers.length === 0 ? "delete" : "disable", blockers };
}
