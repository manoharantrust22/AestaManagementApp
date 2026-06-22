/**
 * Decide whether a contract (subcontract) can be permanently deleted.
 *
 * A contract is only safe to hard-delete when nothing real hangs off it.
 * `subcontract_payments` has an ON DELETE RESTRICT FK (the DB itself throws), and
 * settlements / attendance / headcount / child task-work packages would otherwise
 * silently orphan — so ANY of these blocks the permanent delete. The caller then
 * offers "Cancel contract" (status = cancelled) instead. A clean test contract
 * (all zeros) can be deleted outright; its CASCADE children go with it.
 */
export interface ContractDeleteCounts {
  payments: number;
  settlements: number;
  attendance: number;
  headcount: number;
  packages: number;
}

export interface ContractDeleteDecision {
  canHardDelete: boolean;
  /** Human-readable reasons the contract can't be permanently deleted. */
  blockers: string[];
}

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

export function decideContractDelete(
  counts: ContractDeleteCounts
): ContractDeleteDecision {
  const blockers: string[] = [];
  if (counts.payments > 0) blockers.push(count(counts.payments, "payment recorded", "payments recorded"));
  if (counts.settlements > 0) blockers.push(count(counts.settlements, "salary settlement", "salary settlements"));
  if (counts.attendance > 0) blockers.push(count(counts.attendance, "attendance day", "attendance days"));
  if (counts.headcount > 0) blockers.push(count(counts.headcount, "headcount entry", "headcount entries"));
  if (counts.packages > 0) blockers.push(count(counts.packages, "linked package", "linked packages"));
  return { canHardDelete: blockers.length === 0, blockers };
}
