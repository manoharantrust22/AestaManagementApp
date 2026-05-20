// Row shape returned by get_multi_site_settlement_report RPC.
// One row per (site_id, subcontract_id, week_start).
export interface SettlementReportRow {
  site_id: string;
  site_name: string;
  subcontract_id: string;
  subcontract_title: string;
  contract_type: "mesthri" | "specialist";
  category_id: string | null;
  category_name: string | null;
  week_start: string; // YYYY-MM-DD (Sunday)
  week_end: string;   // YYYY-MM-DD (Saturday)
  paid_amount: number;
  calc_amount: number;
  settlement_count: number;
  notes_concat: string | null;
}

// Scope is either "single site" or "group of sites". The group case carries
// the resolved member site ids so the hook doesn't need to re-resolve them.
export type SettlementReportScope =
  | { mode: "site"; siteId: string; siteName: string }
  | { mode: "group"; groupId: string; groupName: string; siteIds: string[]; siteNames: string[] };

// Wide layout pivot — one row per week with site sub-columns.
// hasDiff = paid > 0 AND calc > 0 AND |paid - calc| > 0.005. When calc = 0
// (no system-calculated value available, e.g. older mesthri contracts tracked
// only via settlements), hasDiff is FALSE — calc = 0 means "unknown", not "mismatch".
export interface WidePivotCell {
  paid: number;
  calc: number;
  hasDiff: boolean;
}

export interface WidePivotRow {
  week_start: string;
  week_end: string;
  bySite: Record<string, WidePivotCell>; // keyed by site_id
  totalPaid: number;
  totalCalc: number;
}

export interface WidePivot {
  sites: { id: string; name: string }[]; // alphabetical
  rows: WidePivotRow[];                  // chronological
  totalsRow: WidePivotRow;               // grand totals; week_start === ""
}

// Export dialog state
export interface ExportConfig {
  granularity: "daily" | "weekly";
  layout: "wide" | "long";
  columns: ExportColumnKey[];
  includeLaborerBreakdown: boolean;
}

export type ExportColumnKey =
  | "date"        // date (daily) OR week range (weekly)
  | "site"
  | "trade"
  | "subcontract"
  | "paid"
  | "calc"
  | "diff"
  | "notes"
  | "payer_source"
  | "payment_mode"
  | "created_by";

export const DEFAULT_EXPORT_COLUMNS: ExportColumnKey[] = [
  "date", "site", "trade", "subcontract", "paid", "calc", "diff", "notes",
];
