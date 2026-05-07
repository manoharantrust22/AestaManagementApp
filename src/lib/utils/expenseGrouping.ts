import {
  type ExpenseBreakdown,
  type ExpenseBreakdownEntry,
  mergeContractSalaryWithAdvance,
} from "./expenseBreakdown";

export interface GroupTotal {
  amount: number;
  count: number;
}

export interface SalarySettlementGroup {
  total: GroupTotal;
  daily: ExpenseBreakdownEntry | null;
  contract: ExpenseBreakdownEntry | null;
}

export interface GroupedBreakdown {
  laborTotal: GroupTotal;
  buildingTotal: GroupTotal;
  salarySettlement: SalarySettlementGroup;
  /** Tea & Snacks under Labor. */
  teaSnacks: ExpenseBreakdownEntry | null;
  /** Direct subcontract payments. Shown under Labor only when count > 0. */
  directPayment: ExpenseBreakdownEntry | null;
  /** Edge-case salary tiles. Shown only when count > 0. */
  excess: ExpenseBreakdownEntry | null;
  unlinkedSalary: ExpenseBreakdownEntry | null;
  /** Building group sub-tiles. */
  material: ExpenseBreakdownEntry | null;
  machinery: ExpenseBreakdownEntry | null;
  general: ExpenseBreakdownEntry | null;
  miscellaneous: ExpenseBreakdownEntry | null;
  /** Anything that didn't match a known type — shown as an "Other" tile if non-zero. */
  other: ExpenseBreakdownEntry | null;
}

const LABOR_TYPES = new Set([
  "Daily Salary",
  "Contract Salary",
  "Advance",
  "Excess",
  "Unlinked Salary",
  "Tea & Snacks",
  "Direct Payment",
]);

const BUILDING_TYPES = new Set([
  "Material",
  "Machinery",
  "General",
  "Miscellaneous",
]);

const sumEntry = (a: ExpenseBreakdownEntry | undefined): GroupTotal =>
  a ? { amount: a.amount, count: a.count } : { amount: 0, count: 0 };

const addTotal = (a: GroupTotal, b: ExpenseBreakdownEntry | undefined): GroupTotal =>
  b ? { amount: a.amount + b.amount, count: a.count + b.count } : a;

/**
 * Groups a flat breakdown (keyed by expense_type) into the Labor / Building
 * structure used by the redesigned summary band. Advance is folded into
 * Contract Salary first via the existing helper so we don't show it as a
 * separate tile.
 */
export function groupExpenseBreakdown(breakdown: ExpenseBreakdown): GroupedBreakdown {
  const merged = mergeContractSalaryWithAdvance(breakdown);

  const daily = merged["Daily Salary"] ?? null;
  const contract = merged["Contract Salary"] ?? null;
  const teaSnacks = merged["Tea & Snacks"] ?? null;
  const directPayment = merged["Direct Payment"] ?? null;
  const excess = merged.Excess ?? null;
  const unlinkedSalary = merged["Unlinked Salary"] ?? null;
  const material = merged.Material ?? null;
  const machinery = merged.Machinery ?? null;
  const general = merged.General ?? null;
  const miscellaneous = merged.Miscellaneous ?? null;

  // Anything else (e.g. category-renamed expenses we don't anticipate) gets
  // bucketed into "Other" so totals stay invariant.
  let otherAmount = 0;
  let otherCount = 0;
  for (const [type, entry] of Object.entries(merged)) {
    if (LABOR_TYPES.has(type) || BUILDING_TYPES.has(type)) continue;
    otherAmount += entry.amount;
    otherCount += entry.count;
  }
  const other =
    otherAmount === 0 && otherCount === 0
      ? null
      : { amount: otherAmount, count: otherCount };

  const salaryDaily = sumEntry(daily ?? undefined);
  const salaryContract = sumEntry(contract ?? undefined);
  const salaryTotal: GroupTotal = {
    amount: salaryDaily.amount + salaryContract.amount,
    count: salaryDaily.count + salaryContract.count,
  };

  let laborTotal: GroupTotal = { amount: salaryTotal.amount, count: salaryTotal.count };
  laborTotal = addTotal(laborTotal, teaSnacks ?? undefined);
  laborTotal = addTotal(laborTotal, directPayment ?? undefined);
  laborTotal = addTotal(laborTotal, excess ?? undefined);
  laborTotal = addTotal(laborTotal, unlinkedSalary ?? undefined);

  let buildingTotal: GroupTotal = { amount: 0, count: 0 };
  buildingTotal = addTotal(buildingTotal, material ?? undefined);
  buildingTotal = addTotal(buildingTotal, machinery ?? undefined);
  buildingTotal = addTotal(buildingTotal, general ?? undefined);
  buildingTotal = addTotal(buildingTotal, miscellaneous ?? undefined);

  return {
    laborTotal,
    buildingTotal,
    salarySettlement: { total: salaryTotal, daily, contract },
    teaSnacks,
    directPayment,
    excess,
    unlinkedSalary,
    material,
    machinery,
    general,
    miscellaneous,
    other,
  };
}

export function formatINR(value: number): string {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
