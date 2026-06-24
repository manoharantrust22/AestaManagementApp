import type { LaborTrackingMode } from "@/types/trade.types";

/**
 * Deep-link builder: hand the user from the Workforce workspace straight to a
 * specific contract's attendance / salary screen.
 *
 * Contracts on the FULL workspace ("detailed" mode) — as well as Civil / in-house /
 * trade-less ones — resolve to the page's default per-laborer flow. That flow is the
 * full machinery (per-laborer attendance, salary settlements, holidays, tea); it is
 * keyed by `subcontract_id`, so it works for ANY trade now that the "Full workspace"
 * mode is offered beyond Civil — not just Civil. For attendance we carry the contract
 * id ALONE so the page stays on the per-laborer flow (the categoryId+trade triple would
 * switch it to the lighter trade headcount view). Every other (non-detailed, non-Civil)
 * tracked trade gets `?categoryId=&contractId=&trade=`, which the attendance and payments
 * pages read to preselect the trade chip and render the contract-scoped headcount view.
 */

/** The slice of a WorkspaceTask the scope link needs (kept minimal for tests). */
export interface ContractScopeRef {
  id: string;
  tradeCategoryId: string | null;
  tradeName: string;
  isInHouse: boolean;
  /** The contract's labour-tracking mode. "detailed" routes to the full per-laborer flow. */
  mode?: LaborTrackingMode;
}

export type ContractScopeBase = "/site/attendance" | "/site/payments";

export function buildContractScopeHref(
  base: ContractScopeBase,
  task: ContractScopeRef
): string {
  // The full per-laborer flow handles: the Civil category, in-house / trade-less
  // contracts, AND any trade explicitly on the "detailed" (Full workspace) mode.
  const usePerLaborerFlow =
    task.mode === "detailed" ||
    task.isInHouse ||
    !task.tradeCategoryId ||
    task.tradeName === "Civil";

  if (usePerLaborerFlow) {
    // For attendance, carry the contract id ALONE (not the categoryId+trade triple,
    // which would switch the page to the trade headcount view). The attendance screen
    // reads it to offer "whole contract / no specific floor" tagging for this contract.
    if (base === "/site/attendance") {
      return `${base}?contractId=${encodeURIComponent(task.id)}`;
    }
    // A non-Civil trade on the FULL workspace (detailed mode) scopes its settlement
    // by the (in-house) contract too. Civil / in-house / trade-less stay on the
    // unscoped aggregate settlement flow (unchanged).
    const scopeByContract =
      task.mode === "detailed" &&
      task.tradeName !== "Civil" &&
      !!task.tradeCategoryId;
    return scopeByContract ? `${base}?contractId=${encodeURIComponent(task.id)}` : base;
  }
  const params = new URLSearchParams({
    // Non-null here: a null tradeCategoryId is already handled by usePerLaborerFlow above.
    categoryId: task.tradeCategoryId ?? "",
    contractId: task.id,
    trade: task.tradeName,
  });
  return `${base}?${params.toString()}`;
}
