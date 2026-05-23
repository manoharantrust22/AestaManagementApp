import { describe, it, expect } from "vitest";
import {
  buildCursorFromLastRow,
  buildCursorPredicate,
  appendPageDedupe,
  PAGE_SIZE,
  type Cursor,
} from "./useExpensesData";
import type { ExpenseRow } from "./useExpensesData";

const mkRow = (id: string, date: string): ExpenseRow =>
  ({ id, date, site_id: "s1", amount: 0 } as ExpenseRow);

describe("buildCursorFromLastRow", () => {
  it("returns null for empty array", () => {
    expect(buildCursorFromLastRow([])).toBeNull();
  });
  it("returns date+id of last row", () => {
    const rows = [mkRow("a", "2026-05-10"), mkRow("b", "2026-05-09")];
    expect(buildCursorFromLastRow(rows)).toEqual({
      date: "2026-05-09",
      id: "b",
    });
  });
});

describe("buildCursorPredicate", () => {
  it("returns PostgREST or() string ordering strictly older than cursor", () => {
    const c: Cursor = { date: "2026-05-09", id: "b" };
    expect(buildCursorPredicate(c)).toBe(
      "date.lt.2026-05-09,and(date.eq.2026-05-09,id.lt.b)",
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
  it("drops rows whose id already exists in prev (defensive against duplicate pages)", () => {
    const prev = [mkRow("a", "2026-05-10"), mkRow("b", "2026-05-09")];
    const next = [mkRow("b", "2026-05-09"), mkRow("c", "2026-05-08")];
    expect(appendPageDedupe(prev, next).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
  it("returns prev unchanged when next is empty", () => {
    const prev = [mkRow("a", "2026-05-10")];
    expect(appendPageDedupe(prev, [])).toBe(prev);
  });
});

describe("PAGE_SIZE", () => {
  it("is 50", () => {
    expect(PAGE_SIZE).toBe(50);
  });
});
