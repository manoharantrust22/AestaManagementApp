import { describe, it, expect } from "vitest";
import { buildCsvRows, buildExportFilename } from "./settlementReportExport";
import type { SettlementReportRow } from "@/types/settlementReport.types";

const padma: SettlementReportRow = {
  site_id: "padma",
  site_name: "Padmavati",
  subcontract_id: "sc-1",
  subcontract_title: "Padma Civil Mesthri",
  contract_type: "mesthri",
  category_id: "cat-civil",
  category_name: "Civil",
  week_start: "2026-04-26",
  week_end: "2026-05-02",
  paid_amount: 12200,
  calc_amount: 12200,
  settlement_count: 2,
  notes_concat: "advance | balance",
};

describe("buildCsvRows — weekly long", () => {
  it("produces one row per input row with default columns", () => {
    const csv = buildCsvRows([padma], {
      granularity: "weekly",
      layout: "long",
      columns: ["date", "site", "trade", "subcontract", "paid", "calc", "diff", "notes"],
      includeLaborerBreakdown: false,
    });
    expect(csv).toHaveLength(1);
    expect(csv[0]).toMatchObject({
      "Week": "2026-04-26 to 2026-05-02",
      "Site": "Padmavati",
      "Trade": "Civil",
      "Subcontract": "Padma Civil Mesthri",
      "Paid": 12200,
      "Calculated": 12200,
      "Diff": 0,
      "Notes": "advance | balance",
    });
  });

  it("omits unchecked columns", () => {
    const csv = buildCsvRows([padma], {
      granularity: "weekly",
      layout: "long",
      columns: ["date", "site", "paid"],
      includeLaborerBreakdown: false,
    });
    expect(Object.keys(csv[0])).toEqual(["Week", "Site", "Paid"]);
  });
});

describe("buildCsvRows — weekly wide", () => {
  it("pivots site amounts into columns", () => {
    const srini: SettlementReportRow = {
      ...padma,
      site_id: "srini",
      site_name: "Srinivasan",
      paid_amount: 8400,
      calc_amount: 8400,
    };
    const csv = buildCsvRows([padma, srini], {
      granularity: "weekly",
      layout: "wide",
      columns: ["date", "paid", "calc"],
      includeLaborerBreakdown: false,
    });
    expect(csv).toHaveLength(1);
    expect(csv[0]).toMatchObject({
      "Week": "2026-04-26 to 2026-05-02",
      "Padmavati Paid": 12200,
      "Padmavati Calc": 12200,
      "Srinivasan Paid": 8400,
      "Srinivasan Calc": 8400,
      "Total Paid": 20600,
      "Total Calc": 20600,
    });
  });
});

describe("buildExportFilename", () => {
  it("builds a filename from scope and date range", () => {
    expect(
      buildExportFilename({
        scopeLabel: "Vishal sites",
        dateFrom: "2026-04-01",
        dateTo: "2026-05-31",
      })
    ).toBe("settlements-vishal-sites-2026-04-01-to-2026-05-31.csv");
  });

  it("sanitises unsafe filename characters", () => {
    expect(
      buildExportFilename({
        scopeLabel: "Vishal/Padma & Srini",
        dateFrom: "2026-04-01",
        dateTo: "2026-05-31",
      })
    ).toBe("settlements-vishal-padma-and-srini-2026-04-01-to-2026-05-31.csv");
  });
});
