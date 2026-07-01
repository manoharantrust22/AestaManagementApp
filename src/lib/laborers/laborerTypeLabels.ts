// Central display labels for laborer types.
//
// The DB stores `laborer_type` as a plain string ("daily" | "contract" |
// "market" | "daily_market") — those are the values we persist and query on,
// so DO NOT change them. This module owns only how those values are SHOWN to
// the user, so the vocabulary stays consistent across attendance, payments and
// the laborers directory.
//
// Vocabulary (chosen with the user, 2026-07):
//   contract → "Company"        — the company's own permanent crew
//   daily    → "Daily"          — day-wage workers hired directly
//   market   → "Market"         — naka / market labour hired for the day
//
// NOTE: daily and market are the SAME category to the business (both are
// day-hired labour, paid directly) — the attendance summary shows them as one
// combined "Daily/Market" column. There is NO "contractor" (other-company)
// concept. The word "Contract" is RESERVED for real fixed-price task-work
// (a `task_work_package`), so a company crew member and a fixed-price contract
// never share the same word.

export type LaborerTypeKind = "daily" | "contract" | "market";

export const LABORER_TYPE_LABELS: Record<LaborerTypeKind, string> = {
  daily: "Daily",
  contract: "Company",
  market: "Market",
};

// Short forms for tight spots (dense table headers, tooltips).
export const LABORER_TYPE_LABELS_SHORT: Record<LaborerTypeKind, string> = {
  daily: "Daily",
  contract: "Co.",
  market: "Mkt",
};

// The combined day-hired bucket (daily + market), shown as one column.
export const DAILY_MARKET_LABEL = "Daily/Market";

export function laborerTypeLabel(kind: LaborerTypeKind): string {
  return LABORER_TYPE_LABELS[kind];
}

export function laborerTypeLabelShort(kind: LaborerTypeKind): string {
  return LABORER_TYPE_LABELS_SHORT[kind];
}

// The fourth, non-`laborer_type` bucket: laborers tagged to a real fixed-price
// task-work package. Kept here so the whole "who worked" vocabulary lives in
// one place.
export const TASK_WORK_LABEL = "Task-work";
export const TASK_WORK_LABEL_SHORT = "Task";
