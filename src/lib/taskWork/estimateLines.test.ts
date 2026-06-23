import { describe, it, expect } from "vitest";
import { estimateRollup } from "./estimateLines";
import type { DayWorkerLine } from "@/types/taskWork.types";

const line = (
  label: string,
  count: number,
  daily_rate: number
): DayWorkerLine => ({ kind: "custom", ref_id: null, label, count, daily_rate });

describe("estimateRollup", () => {
  it("rolls up a single worker type like the old simple estimate", () => {
    // Old behaviour: crew 5 × 10 days × ₹600.
    const r = estimateRollup([line("Crew", 5, 600)], 10);
    expect(r.crewSize).toBe(5);
    expect(r.days).toBe(10);
    expect(r.blendedRate).toBe(600);
    expect(r.manDays).toBe(50);
    expect(r.benchmarkCost).toBe(50 * 600);
  });

  it("blends multiple rates so the benchmark stays correct", () => {
    // Mason ×2 @ ₹1000, female helper ×1 @ ₹600, male helper ×2 @ ₹700, 10 days.
    const lines = [
      line("Mason", 2, 1000),
      line("Female helper", 1, 600),
      line("Male helper", 2, 700),
    ];
    const r = estimateRollup(lines, 10);
    const dailyValue = 2 * 1000 + 1 * 600 + 2 * 700; // 4000
    const crew = 2 + 1 + 2; // 5
    expect(r.crewSize).toBe(crew);
    expect(r.blendedRate).toBe(dailyValue / crew); // 800
    expect(r.benchmarkCost).toBe(dailyValue * 10); // 40000
    // The view computes crew × days × blendedRate — must equal benchmarkCost.
    expect(r.crewSize * r.days * r.blendedRate).toBe(r.benchmarkCost);
  });

  it("supports fractional counts (half days)", () => {
    const r = estimateRollup([line("Mason", 1.5, 1000)], 4);
    expect(r.crewSize).toBe(1.5);
    expect(r.manDays).toBe(6);
    expect(r.benchmarkCost).toBe(6000);
  });

  it("is safe with empty lines / zero days", () => {
    expect(estimateRollup([], 10)).toMatchObject({
      crewSize: 0,
      blendedRate: 0,
      manDays: 0,
      benchmarkCost: 0,
    });
    expect(estimateRollup([line("Mason", 2, 1000)], 0).benchmarkCost).toBe(0);
    expect(estimateRollup(null, null).benchmarkCost).toBe(0);
  });

  it("ignores garbage/negative values", () => {
    const r = estimateRollup(
      [line("Mason", -2, 1000), line("Helper", 3, 600)],
      5
    );
    expect(r.crewSize).toBe(3); // negative count dropped
    expect(r.benchmarkCost).toBe(3 * 600 * 5);
  });
});
