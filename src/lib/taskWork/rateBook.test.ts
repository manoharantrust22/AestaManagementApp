import { describe, it, expect } from "vitest";
import { buildRateBook } from "./rateBook";
import type { TaskWorkProfitability } from "@/types/taskWork.types";

function row(p: Partial<TaskWorkProfitability>): TaskWorkProfitability {
  return {
    package_id: "p",
    site_id: "s",
    package_number: "TW-1",
    title: "t",
    labor_category_id: null,
    category_name: null,
    status: "completed",
    parent_subcontract_id: null,
    total_value: 0,
    total_units: null,
    measurement_unit: null,
    benchmark_daily_rate: null,
    retention_percent: 0,
    estimated_days: null,
    estimated_crew_size: null,
    planned_start_date: null,
    planned_end_date: null,
    actual_start_date: null,
    actual_end_date: null,
    actual_man_days: 0,
    actual_working_days: 0,
    paid: 0,
    wages_prepaid: 0,
    total_paid: 0,
    balance: 0,
    retention_held: 0,
    daywage_benchmark_cost: 0,
    company_saving: 0,
    saving_pct: null,
    crew_effective_daily: null,
    computed_rate_per_unit: null,
    estimated_man_days: 0,
    estimated_daywage_cost: 0,
    ...p,
  };
}

describe("buildRateBook", () => {
  it("groups by work-type and unit and summarises the rate", () => {
    const groups = buildRateBook([
      row({ category_name: "Masonry", measurement_unit: "sqft", computed_rate_per_unit: 40 }),
      row({ category_name: "Masonry", measurement_unit: "sqft", computed_rate_per_unit: 44 }),
      row({ category_name: "Masonry", measurement_unit: "sqft", computed_rate_per_unit: 36 }),
      row({ category_name: "Plastering", measurement_unit: "sqft", computed_rate_per_unit: 22 }),
    ]);

    expect(groups).toHaveLength(2);
    const masonry = groups.find((g) => g.categoryName === "Masonry")!;
    expect(masonry.count).toBe(3);
    expect(masonry.avgRate).toBe(40);
    expect(masonry.minRate).toBe(36);
    expect(masonry.maxRate).toBe(44);
    // Most-evidence group comes first.
    expect(groups[0].categoryName).toBe("Masonry");
  });

  it("keeps the same work-type in separate groups when the unit differs", () => {
    const groups = buildRateBook([
      row({ category_name: "Carpentry", measurement_unit: "sqft", computed_rate_per_unit: 50 }),
      row({ category_name: "Carpentry", measurement_unit: "rft", computed_rate_per_unit: 18 }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("ignores rows with no computed rate, and buckets missing work-type as 'Other'", () => {
    const groups = buildRateBook([
      row({ category_name: null, measurement_unit: "nos", computed_rate_per_unit: 120 }),
      row({ category_name: "X", measurement_unit: "nos", computed_rate_per_unit: null }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].categoryName).toBe("Other");
    expect(groups[0].count).toBe(1);
  });
});
