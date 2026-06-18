/**
 * Daily Compliance Checklist — shared types.
 *
 * The compliance rows come from the get_checklist_compliance RPC (returns jsonb).
 * The template + entry shapes mirror the checklist_templates / checklist_entries
 * tables (not yet in the generated database.types.ts — this feature uses local
 * types + casts, matching the codebase pattern in settings/construction-phases).
 */

export type ChecklistRole = "admin" | "office" | "site_engineer";

export type DetectionType = "auto" | "manual";

export type DetectionSource =
  | "attendance_morning"
  | "attendance_evening"
  | "stock_confirmation"
  | "material_usage"
  | "wallet_settlement"
  | "delivery_status";

export type AppliesScope = "per_site" | "per_user";

/** Overlay intent the engineer can record on top of auto detection. */
export type OverlayStatus = "done" | "deferred" | "na";

/** Unified status computed by the resolver. */
export type ChecklistStatus =
  | "on_time"
  | "late"
  | "deferred_done"
  | "deferred_pending"
  | "missed"
  | "pending"
  | "na";

/** One row of the compliance matrix (one user × site × item × date). */
export interface ChecklistComplianceRow {
  user_id: string;
  user_name: string;
  role: ChecklistRole;
  site_id: string | null;
  site_name: string | null;
  template_id: string;
  item_key: string;
  label: string;
  description: string | null;
  detection_type: DetectionType;
  detection_source: DetectionSource | null;
  deep_link_path: string | null;
  applies_scope: AppliesScope;
  sort_order: number;
  allow_defer: boolean;
  requires_defer_reason: boolean;
  business_date: string; // YYYY-MM-DD
  status: ChecklistStatus;
  detected_at: string | null;
  overlay_status: OverlayStatus | null;
  completed_at: string | null;
  deferred_to: string | null;
  defer_reason: string | null;
  note: string | null;
  has_candidate: boolean;
}

/** checklist_templates row. */
export interface ChecklistTemplate {
  id: string;
  company_id: string;
  role: ChecklistRole;
  item_key: string;
  label: string;
  description: string | null;
  detection_type: DetectionType;
  detection_source: DetectionSource | null;
  deep_link_path: string | null;
  applies_scope: AppliesScope;
  allow_defer: boolean;
  requires_defer_reason: boolean;
  expected_by_time: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Statuses that count as "completed for the day" (done, or validly deferred). */
export const DONE_STATUSES: ChecklistStatus[] = ["on_time", "late", "deferred_done", "na"];

/** Whether a status represents a problem the office should notice. */
export function isProblemStatus(s: ChecklistStatus): boolean {
  return s === "missed" || s === "late";
}

/** Display metadata per status (label + MUI palette color). */
export const STATUS_META: Record<
  ChecklistStatus,
  { label: string; color: "success" | "warning" | "error" | "info" | "default"; short: string }
> = {
  on_time: { label: "On time", color: "success", short: "On time" },
  late: { label: "Late", color: "warning", short: "Late" },
  deferred_done: { label: "Done (was deferred)", color: "success", short: "Done" },
  deferred_pending: { label: "Deferred", color: "info", short: "Deferred" },
  missed: { label: "Missed", color: "error", short: "Missed" },
  pending: { label: "Pending", color: "default", short: "Pending" },
  na: { label: "Nothing due", color: "default", short: "N/A" },
};

/** Local (IST ≈ device) date as YYYY-MM-DD. */
export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Add N days to a YYYY-MM-DD string, returning YYYY-MM-DD. */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
