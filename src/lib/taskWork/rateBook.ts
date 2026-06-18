// Pure aggregation for the Task Work rate book: roll up completed/measured
// packages into a "₹ per unit, by work type" table the office can price the
// next package from. Kept pure for unit-testing; the page is the thin wiring.

import type {
  TaskWorkMeasurementUnit,
  TaskWorkProfitability,
} from "@/types/taskWork.types";

export interface RateBookGroup {
  key: string;
  categoryName: string;
  unit: TaskWorkMeasurementUnit | "unit";
  count: number;
  avgRate: number;
  minRate: number;
  maxRate: number;
  rows: TaskWorkProfitability[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Group rows by (work type, unit) and summarise the ₹/unit rate. Only rows with
 * a computed rate are considered. Groups are sorted by package count, descending
 * (the rates you have the most evidence for first).
 */
export function buildRateBook(
  rows: TaskWorkProfitability[]
): RateBookGroup[] {
  const groups = new Map<string, TaskWorkProfitability[]>();

  for (const r of rows) {
    if (r.computed_rate_per_unit == null) continue;
    const category = r.category_name ?? "Other";
    const unit = r.measurement_unit ?? "unit";
    const key = `${category}__${unit}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const result: RateBookGroup[] = [];
  for (const [key, list] of groups) {
    const rates = list.map((r) => r.computed_rate_per_unit as number);
    const sum = rates.reduce((a, b) => a + b, 0);
    const [categoryName, unit] = key.split("__");
    result.push({
      key,
      categoryName,
      unit: unit as RateBookGroup["unit"],
      count: list.length,
      avgRate: round2(sum / list.length),
      minRate: round2(Math.min(...rates)),
      maxRate: round2(Math.max(...rates)),
      rows: list,
    });
  }

  return result.sort((a, b) => b.count - a.count || a.categoryName.localeCompare(b.categoryName));
}
