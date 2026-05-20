import { describe, it, expect } from "vitest";
import { pivotToWide } from "./settlementReportPivot";
import type { SettlementReportRow } from "@/types/settlementReport.types";

function row(partial: Partial<SettlementReportRow>): SettlementReportRow {
  return {
    site_id: "site-A",
    site_name: "Site A",
    subcontract_id: "sc-1",
    subcontract_title: "Mesthri team",
    contract_type: "mesthri",
    category_id: "cat-civil",
    category_name: "Civil",
    week_start: "2026-04-26",
    week_end: "2026-05-02",
    paid_amount: 0,
    calc_amount: 0,
    settlement_count: 0,
    notes_concat: null,
    ...partial,
  };
}

describe("pivotToWide", () => {
  it("returns empty pivot when no rows", () => {
    const result = pivotToWide([]);
    expect(result.sites).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(result.totalsRow.totalPaid).toBe(0);
  });

  it("groups rows by week and pivots site amounts", () => {
    const rows = [
      row({ site_id: "padma", site_name: "Padmavati", week_start: "2026-04-26", week_end: "2026-05-02", paid_amount: 12200, calc_amount: 12200 }),
      row({ site_id: "srini", site_name: "Srinivasan", week_start: "2026-04-26", week_end: "2026-05-02", paid_amount: 8400, calc_amount: 8400 }),
      row({ site_id: "padma", site_name: "Padmavati", week_start: "2026-05-03", week_end: "2026-05-09", paid_amount: 9800, calc_amount: 9800 }),
      row({ site_id: "srini", site_name: "Srinivasan", week_start: "2026-05-03", week_end: "2026-05-09", paid_amount: 10500, calc_amount: 10800 }),
    ];

    const result = pivotToWide(rows);

    expect(result.sites.map((s) => s.id)).toEqual(["padma", "srini"]);
    expect(result.rows).toHaveLength(2);

    expect(result.rows[0].bySite["padma"].paid).toBe(12200);
    expect(result.rows[0].bySite["srini"].paid).toBe(8400);
    expect(result.rows[0].totalPaid).toBe(20600);
    expect(result.rows[0].bySite["srini"].hasDiff).toBe(false);

    expect(result.rows[1].bySite["srini"].paid).toBe(10500);
    expect(result.rows[1].bySite["srini"].calc).toBe(10800);
    expect(result.rows[1].bySite["srini"].hasDiff).toBe(true);

    expect(result.totalsRow.totalPaid).toBe(40900);
    expect(result.totalsRow.totalCalc).toBe(41200);
    expect(result.totalsRow.bySite["padma"].paid).toBe(22000);
    expect(result.totalsRow.bySite["srini"].paid).toBe(18900);
  });

  it("sums multiple subcontracts within the same (site, week)", () => {
    const rows = [
      row({ site_id: "padma", site_name: "Padmavati", subcontract_id: "sc-1", paid_amount: 5000, calc_amount: 5000 }),
      row({ site_id: "padma", site_name: "Padmavati", subcontract_id: "sc-2", paid_amount: 3000, calc_amount: 3000 }),
    ];
    const result = pivotToWide(rows);
    expect(result.rows[0].bySite["padma"].paid).toBe(8000);
  });

  it("orders sites alphabetically by name", () => {
    const rows = [
      row({ site_id: "z-site", site_name: "Zebra", paid_amount: 100 }),
      row({ site_id: "a-site", site_name: "Alpha", paid_amount: 200 }),
    ];
    const result = pivotToWide(rows);
    expect(result.sites.map((s) => s.name)).toEqual(["Alpha", "Zebra"]);
  });

  it("orders weeks chronologically", () => {
    const rows = [
      row({ week_start: "2026-05-10", week_end: "2026-05-16", paid_amount: 1 }),
      row({ week_start: "2026-04-26", week_end: "2026-05-02", paid_amount: 1 }),
      row({ week_start: "2026-05-03", week_end: "2026-05-09", paid_amount: 1 }),
    ];
    const result = pivotToWide(rows);
    expect(result.rows.map((r) => r.week_start)).toEqual([
      "2026-04-26", "2026-05-03", "2026-05-10",
    ]);
  });

  it("suppresses hasDiff when calc is 0 (no system-calculated value available)", () => {
    // Older mesthri contracts have paid > 0 but calc = 0 because per-laborer
    // attendance was never recorded. Treat this as "unknown", not "mismatch".
    const rows = [
      row({ site_id: "padma", site_name: "Padmavati", paid_amount: 43000, calc_amount: 0 }),
    ];
    const result = pivotToWide(rows);
    expect(result.rows[0].bySite["padma"].hasDiff).toBe(false);
    expect(result.totalsRow.bySite["padma"].hasDiff).toBe(false);
  });

  it("suppresses hasDiff when paid is 0 (settlement not yet recorded)", () => {
    // In-house labor where attendance is tracked but no settlement_groups
    // payment has been recorded yet — calc > 0, paid = 0. Not a mismatch.
    const rows = [
      row({ site_id: "padma", site_name: "Padmavati", paid_amount: 0, calc_amount: 22000 }),
    ];
    const result = pivotToWide(rows);
    expect(result.rows[0].bySite["padma"].hasDiff).toBe(false);
  });

  it("does fire hasDiff when both paid and calc are positive but differ", () => {
    const rows = [
      row({ site_id: "padma", site_name: "Padmavati", paid_amount: 3500, calc_amount: 5000 }),
    ];
    const result = pivotToWide(rows);
    expect(result.rows[0].bySite["padma"].hasDiff).toBe(true);
  });
});
