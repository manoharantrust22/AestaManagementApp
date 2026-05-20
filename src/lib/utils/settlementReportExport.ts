import Papa from "papaparse";
import type {
  ExportColumnKey,
  ExportConfig,
  SettlementReportRow,
} from "@/types/settlementReport.types";

function formatWeek(weekStart: string, weekEnd: string): string {
  return `${weekStart} to ${weekEnd}`;
}

function buildLongRow(
  row: SettlementReportRow,
  columns: ExportColumnKey[],
  granularity: "daily" | "weekly"
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const c of columns) {
    switch (c) {
      case "date":
        out[granularity === "weekly" ? "Week" : "Date"] =
          granularity === "weekly" ? formatWeek(row.week_start, row.week_end) : row.week_start;
        break;
      case "site":
        out["Site"] = row.site_name;
        break;
      case "trade":
        out["Trade"] = row.category_name ?? "";
        break;
      case "subcontract":
        out["Subcontract"] = row.subcontract_title;
        break;
      case "paid":
        out["Paid"] = row.paid_amount;
        break;
      case "calc":
        out["Calculated"] = row.calc_amount;
        break;
      case "diff":
        out["Diff"] = Number((row.paid_amount - row.calc_amount).toFixed(2));
        break;
      case "notes":
        out["Notes"] = row.notes_concat ?? "";
        break;
      case "payer_source":
        out["Payer Source"] = "";
        break;
      case "payment_mode":
        out["Payment Mode"] = "";
        break;
      case "created_by":
        out["Created By"] = "";
        break;
    }
  }
  return out;
}

function buildWideRows(
  rows: SettlementReportRow[],
  columns: ExportColumnKey[],
  granularity: "daily" | "weekly"
): Record<string, string | number>[] {
  const dateKey = (r: SettlementReportRow) => r.week_start;
  const groups = new Map<string, SettlementReportRow[]>();
  for (const r of rows) {
    const k = dateKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }

  const siteNames = Array.from(new Set(rows.map((r) => r.site_name))).sort();
  const includePaid = columns.includes("paid");
  const includeCalc = columns.includes("calc");

  const out: Record<string, string | number>[] = [];
  const sortedKeys = Array.from(groups.keys()).sort();
  for (const k of sortedKeys) {
    const groupRows = groups.get(k)!;
    const sample = groupRows[0];
    const csvRow: Record<string, string | number> = {};
    if (columns.includes("date")) {
      csvRow[granularity === "weekly" ? "Week" : "Date"] =
        granularity === "weekly" ? formatWeek(sample.week_start, sample.week_end) : sample.week_start;
    }
    let totalPaid = 0;
    let totalCalc = 0;
    for (const site of siteNames) {
      const siteRows = groupRows.filter((r) => r.site_name === site);
      const paid = siteRows.reduce((s, r) => s + Number(r.paid_amount || 0), 0);
      const calc = siteRows.reduce((s, r) => s + Number(r.calc_amount || 0), 0);
      if (includePaid) csvRow[`${site} Paid`] = paid;
      if (includeCalc) csvRow[`${site} Calc`] = calc;
      totalPaid += paid;
      totalCalc += calc;
    }
    if (includePaid) csvRow["Total Paid"] = totalPaid;
    if (includeCalc) csvRow["Total Calc"] = totalCalc;
    if (columns.includes("notes")) {
      csvRow["Notes"] = groupRows.map((r) => r.notes_concat || "").filter(Boolean).join(" | ");
    }
    out.push(csvRow);
  }
  return out;
}

export function buildCsvRows(
  rows: SettlementReportRow[],
  config: ExportConfig
): Record<string, string | number>[] {
  if (config.layout === "wide") {
    return buildWideRows(rows, config.columns, config.granularity);
  }
  return rows.map((r) => buildLongRow(r, config.columns, config.granularity));
}

export interface FilenameArgs {
  scopeLabel: string;
  dateFrom: string;
  dateTo: string;
}

export function buildExportFilename(args: FilenameArgs): string {
  const slug = args.scopeLabel
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `settlements-${slug}-${args.dateFrom}-to-${args.dateTo}.csv`;
}

export function downloadCsv(
  rows: Record<string, string | number>[],
  filename: string
): void {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
