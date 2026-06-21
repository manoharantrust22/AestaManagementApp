/**
 * Deep-link builder: hand the user from the Workforce workspace straight to a
 * specific contract's attendance / salary screen.
 *
 * Civil / in-house contracts resolve to the page's default per-laborer Civil
 * flow (no params): that page already opens on Civil, and Civil work is tracked
 * per laborer, not as a trade headcount view — every Civil-category contract
 * (incl. mesthri crews like Jithin) records through that one flow. Every other
 * (non-Civil) trade gets `?categoryId=&contractId=&trade=`, which the attendance
 * and payments pages read to preselect the trade chip and render the
 * contract-scoped view.
 */

/** The slice of a WorkspaceTask the scope link needs (kept minimal for tests). */
export interface ContractScopeRef {
  id: string;
  tradeCategoryId: string | null;
  tradeName: string;
  isInHouse: boolean;
}

export type ContractScopeBase = "/site/attendance" | "/site/payments";

export function buildContractScopeHref(
  base: ContractScopeBase,
  task: ContractScopeRef
): string {
  // Civil-category, in-house, or trade-less contracts use the page default
  // (the per-laborer Civil flow). Mirror TradeChipFilter's "Civil" test.
  if (task.isInHouse || !task.tradeCategoryId || task.tradeName === "Civil") {
    return base;
  }
  const params = new URLSearchParams({
    categoryId: task.tradeCategoryId,
    contractId: task.id,
    trade: task.tradeName,
  });
  return `${base}?${params.toString()}`;
}
