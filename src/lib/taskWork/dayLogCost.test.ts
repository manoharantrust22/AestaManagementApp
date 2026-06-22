import { describe, it, expect } from "vitest";
import {
  lineValue,
  lineCountTotal,
  dayLogValue,
  sumDayLogValue,
  deriveCountsFromLines,
  summarizeLines,
} from "./dayLogCost";
import type { DayWorkerLine, TaskWorkDayLog } from "@/types/taskWork.types";

const line = (
  label: string,
  count: number,
  daily_rate: number
): DayWorkerLine => ({ kind: "role", ref_id: null, label, count, daily_rate });

describe("lineValue", () => {
  it("is count × daily_rate", () => {
    expect(lineValue({ count: 2, daily_rate: 1000 })).toBe(2000);
  });
  it("clamps negatives / garbage to 0", () => {
    expect(lineValue({ count: -2, daily_rate: 1000 })).toBe(0);
    expect(lineValue({ count: 2, daily_rate: NaN as unknown as number })).toBe(0);
  });
  it("supports fractional counts (half day)", () => {
    expect(lineValue({ count: 0.5, daily_rate: 800 })).toBe(400);
  });
});

describe("dayLogValue / sumDayLogValue", () => {
  it("sums the lines for a day (2 Mason @1000 + 2 Helper @800 = 3600)", () => {
    const log = { worker_lines: [line("Mason", 2, 1000), line("Helper", 2, 800)] };
    expect(dayLogValue(log)).toBe(3600);
  });
  it("treats legacy headcount-only rows (null lines) as 0", () => {
    expect(dayLogValue({ worker_lines: null })).toBe(0);
    expect(dayLogValue({ worker_lines: [] })).toBe(0);
  });
  it("sums value across day logs", () => {
    const logs: Pick<TaskWorkDayLog, "worker_lines">[] = [
      { worker_lines: [line("Mason", 2, 1000)] },
      { worker_lines: [line("Helper", 1, 800)] },
      { worker_lines: null },
    ];
    expect(sumDayLogValue(logs)).toBe(2800);
  });
});

describe("deriveCountsFromLines", () => {
  it("man_days is the exact sum; worker_count is rounded", () => {
    expect(deriveCountsFromLines([line("Mason", 2, 1000), line("Helper", 1.5, 800)])).toEqual({
      worker_count: 4, // round(3.5)
      man_days: 3.5,
    });
  });
  it("is 0/0 for no lines", () => {
    expect(deriveCountsFromLines([])).toEqual({ worker_count: 0, man_days: 0 });
  });
});

describe("lineCountTotal / summarizeLines", () => {
  it("totals counts", () => {
    expect(lineCountTotal([line("Mason", 2, 1000), line("Helper", 2, 800)])).toBe(4);
  });
  it("summarizes non-empty lines", () => {
    expect(summarizeLines([line("Mason", 2, 1000), line("Helper", 2, 800)])).toBe(
      "Mason ×2 · Helper ×2"
    );
    expect(summarizeLines([line("", 0, 0)])).toBe("");
    expect(summarizeLines(null)).toBe("");
  });
});
