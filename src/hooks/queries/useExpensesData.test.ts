import { describe, it, expect } from "vitest";
import {
  buildCursorFromLastRow,
  buildCursorPredicate,
  appendPageDedupe,
  PAGE_SIZE,
  type Cursor,
  type ExpenseRow,
} from "./useExpensesData";

const mkRow = (
  id: string,
  date: string,
  expenseType: string = "Daily Salary",
): ExpenseRow =>
  ({ id, date, expense_type: expenseType, site_id: "s1", amount: 0 } as ExpenseRow);

describe("buildCursorFromLastRow", () => {
  it("returns null for empty array", () => {
    expect(buildCursorFromLastRow([])).toBeNull();
  });
  it("returns date+id+expenseType of last row", () => {
    const rows = [mkRow("a", "2026-05-10"), mkRow("b", "2026-05-09")];
    expect(buildCursorFromLastRow(rows)).toEqual({
      date: "2026-05-09",
      id: "b",
      expenseType: "Daily Salary",
    });
  });
  it("returns the single row's date+id+expenseType when array has length 1", () => {
    expect(buildCursorFromLastRow([mkRow("only", "2026-05-10")])).toEqual({
      date: "2026-05-10",
      id: "only",
      expenseType: "Daily Salary",
    });
  });
});

describe("buildCursorPredicate", () => {
  it("returns PostgREST or() string ordering strictly older than cursor", () => {
    const c: Cursor = { date: "2026-05-09", id: "b", expenseType: "Advance" };
    expect(buildCursorPredicate(c)).toBe(
      "date.lt.2026-05-09,and(date.eq.2026-05-09,id.lt.b),and(date.eq.2026-05-09,id.eq.b,expense_type.lt.Advance)",
    );
  });
});

describe("appendPageDedupe", () => {
  it("appends new rows to the tail", () => {
    const prev = [mkRow("a", "2026-05-10"), mkRow("b", "2026-05-09")];
    const next = [mkRow("c", "2026-05-08"), mkRow("d", "2026-05-07")];
    expect(appendPageDedupe(prev, next).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });
  it("drops rows whose (id, expense_type) already exists in prev (defensive against duplicate pages)", () => {
    const prev = [mkRow("a", "2026-05-10"), mkRow("b", "2026-05-09")];
    const next = [mkRow("b", "2026-05-09"), mkRow("c", "2026-05-08")];
    expect(appendPageDedupe(prev, next).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
  it("keeps a split-settlement sibling that shares id but has a different expense_type", () => {
    // A settlement paid partly as Advance and partly as Contract Salary
    // surfaces as two v_all_expenses rows sharing one id (= settlement_group_id).
    // Deduping by id alone would wrongly drop the sibling below.
    const prev = [mkRow("shared", "2026-07-07", "Contract Salary")];
    const next = [mkRow("shared", "2026-07-07", "Advance"), mkRow("c", "2026-07-06")];
    const result = appendPageDedupe(prev, next);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.expense_type)).toEqual([
      "Contract Salary",
      "Advance",
      "Daily Salary",
    ]);
  });
  it("returns prev unchanged when next is empty", () => {
    const prev = [mkRow("a", "2026-05-10")];
    expect(appendPageDedupe(prev, [])).toBe(prev);
  });
  it("returns the new page verbatim when prev is empty", () => {
    const next = [mkRow("a", "2026-05-10"), mkRow("b", "2026-05-09")];
    const result = appendPageDedupe([], next);
    expect(result.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("PAGE_SIZE", () => {
  it("is 50", () => {
    expect(PAGE_SIZE).toBe(50);
  });
});
