// Task Work (piece-rate "naka" labour) module types.
//
// A Task Work package is a fixed-price chunk of work given to a maistry crew.
// We pay ad-hoc advances during the work and a final settlement at completion —
// never daily wages. The daily headcount log is for profitability analysis only
// (man-days), NOT attendance, and is never paid.
//
// Hand-written (not from db.types.ts) so the module builds without a full type
// regen; queries cast through `as any` / typed helpers where Supabase's generated
// types don't yet know these tables.

import type { PayerSourceSplitRow } from "@/types/settlement.types";

export type TaskWorkStatus =
  | "draft"
  | "active"
  | "on_hold"
  | "completed"
  | "cancelled";

export type TaskWorkPricingMode = "lump_sum" | "rate_based";

export type TaskWorkMeasurementUnit =
  | "sqft"
  | "rft"
  | "nos"
  | "lumpsum"
  | "per_point";

export type TaskWorkPaymentType =
  | "advance"
  | "part_payment"
  | "final_settlement"
  | "retention_release";

export type TaskWorkPaymentChannel = "direct" | "engineer_wallet";

export type TaskWorkPaymentMode =
  | "cash"
  | "upi"
  | "bank_transfer"
  | "cheque"
  | "other";

// ---------------------------------------------------------------------------
// Row shapes (mirror the SQL tables)
// ---------------------------------------------------------------------------

export interface TaskWorkPackage {
  id: string;
  site_id: string;
  package_number: string;
  title: string;
  scope_of_work: string | null;
  labor_category_id: string | null;
  maistry_laborer_id: string | null;
  maistry_name: string | null;
  maistry_phone: string | null;
  pricing_mode: TaskWorkPricingMode;
  total_value: number;
  rate_per_unit: number | null;
  measurement_unit: TaskWorkMeasurementUnit | null;
  total_units: number | null;
  estimated_crew_size: number | null;
  estimated_days: number | null;
  benchmark_daily_rate: number | null;
  // Per-worker-type daywage estimate breakdown (Mason ×2 @ ₹1000, helper ×3 @
  // ₹600, …), all sharing estimated_days. The scalar fields above are the
  // rolled-up summary kept in sync from these for v_task_work_profitability.
  // NULL on legacy rows that only had a single crew size + daily wage.
  estimate_lines: DayWorkerLine[] | null;
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  retention_percent: number;
  status: TaskWorkStatus;
  parent_subcontract_id: string | null;
  // Mesthri commission: when enabled, this package's company laborers are paid
  // directly by the week (net of commission) and the maistry collects the per-day
  // commission. effective_from is the cutover Sunday (see migration 20260705120000).
  mesthri_commission_enabled: boolean;
  mesthri_commission_effective_from: string | null;
  notes: string | null;
  completion_reason: string | null;
  balance_waived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// Convenience: a package joined with a few display labels.
export interface TaskWorkPackageWithMeta extends TaskWorkPackage {
  category_name?: string | null;
  parent_subcontract_title?: string | null;
  /** Σ non-deleted task_work_payments, joined in for the workforce rollup. */
  paid?: number;
}

/**
 * One worker-type line within a day log. `kind` records where the type came
 * from: a labour role (rate book), a specific named laborer, or a free-typed
 * custom label. `count` may be fractional (0.5 = half day). The line's value is
 * `count × daily_rate`.
 */
export type DayWorkerLineKind = "role" | "laborer" | "custom";

export interface DayWorkerLine {
  kind: DayWorkerLineKind;
  ref_id: string | null; // role_id or laborer_id; null for custom
  label: string;
  count: number;
  daily_rate: number;
}

export interface TaskWorkDayLog {
  id: string;
  package_id: string;
  site_id: string;
  log_date: string;
  worker_count: number;
  worker_note: string | null;
  man_days: number;
  // Per-type breakdown. NULL/absent on legacy headcount-only rows.
  worker_lines: DayWorkerLine[] | null;
  // true = hand-entered/edited (protected from attendance derivation);
  // false = auto-derived from attendance task_work_package_id assignments.
  is_manual_override: boolean;
  recorded_by: string | null;
  created_at: string;
}

export interface TaskWorkPayment {
  id: string;
  package_id: string;
  site_id: string;
  payment_type: TaskWorkPaymentType;
  amount: number;
  payment_date: string;
  payment_mode: TaskWorkPaymentMode;
  payment_channel: TaskWorkPaymentChannel | null;
  payer_source: string | null;
  payer_name: string | null;
  payer_source_split: PayerSourceSplitRow[] | null;
  engineer_transaction_id: string | null;
  balance_after_payment: number | null;
  reference_number: string | null;
  proof_url: string | null;
  is_deleted: boolean;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Variations (extras / change orders) — task_work_variations
// ---------------------------------------------------------------------------

export type TaskWorkVariationStatus = "pending" | "approved" | "rejected";

export interface TaskWorkVariation {
  id: string;
  package_id: string;
  site_id: string;
  amount: number;
  reason: string;
  status: TaskWorkVariationStatus;
  requested_date: string;
  decided_date: string | null;
  decided_note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface TaskWorkVariationInput {
  package_id: string;
  site_id: string;
  amount: number;
  reason: string;
  requested_date: string;
}

// ---------------------------------------------------------------------------
// Profitability (v_task_work_profitability — one row per package)
// ---------------------------------------------------------------------------

export interface TaskWorkProfitability {
  package_id: string;
  site_id: string;
  package_number: string;
  title: string;
  labor_category_id: string | null;
  category_name: string | null;
  status: TaskWorkStatus;
  parent_subcontract_id: string | null;
  total_value: number;
  total_units: number | null;
  measurement_unit: TaskWorkMeasurementUnit | null;
  benchmark_daily_rate: number | null;
  retention_percent: number;
  estimated_days: number | null;
  estimated_crew_size: number | null;
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  actual_man_days: number;
  actual_working_days: number;
  paid: number;
  balance: number;
  retention_held: number;
  daywage_benchmark_cost: number;
  company_saving: number;
  saving_pct: number | null;
  crew_effective_daily: number | null;
  computed_rate_per_unit: number | null;
  estimated_man_days: number;
  estimated_daywage_cost: number;
}

// ---------------------------------------------------------------------------
// Input shapes for mutations
// ---------------------------------------------------------------------------

export interface TaskWorkPackageInput {
  site_id: string;
  title: string;
  scope_of_work?: string | null;
  labor_category_id?: string | null;
  maistry_laborer_id?: string | null;
  maistry_name?: string | null;
  maistry_phone?: string | null;
  pricing_mode: TaskWorkPricingMode;
  total_value: number;
  rate_per_unit?: number | null;
  measurement_unit?: TaskWorkMeasurementUnit | null;
  total_units?: number | null;
  estimated_crew_size?: number | null;
  estimated_days?: number | null;
  benchmark_daily_rate?: number | null;
  estimate_lines?: DayWorkerLine[] | null;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
  retention_percent?: number;
  status?: TaskWorkStatus;
  parent_subcontract_id?: string | null;
  mesthri_commission_enabled?: boolean;
  mesthri_commission_effective_from?: string | null;
  notes?: string | null;
  completion_reason?: string | null;
  balance_waived?: boolean;
}

export interface TaskWorkDayLogInput {
  package_id: string;
  site_id: string;
  log_date: string;
  worker_note?: string | null;
  // The per-type breakdown is the source of truth; worker_count and man_days are
  // derived from it by the upsert service (Σ counts).
  worker_lines: DayWorkerLine[];
}

export interface TaskWorkPaymentInput {
  package_id: string;
  site_id: string;
  payment_type: TaskWorkPaymentType;
  amount: number;
  payment_date: string;
  payment_mode: TaskWorkPaymentMode;
  payment_channel: TaskWorkPaymentChannel;
  // Payer source — direct payments capture the source; wallet spends inherit it
  // from the wallet deposit, so these may be omitted for the wallet channel.
  payer_source?: string | null;
  payer_name?: string | null;
  payer_source_split?: PayerSourceSplitRow[] | null;
  // Wallet channel context (engineer paying from their site wallet)
  engineer_id?: string | null;
  proof_url?: string | null;
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export const TASK_WORK_STATUS_LABEL: Record<TaskWorkStatus, string> = {
  draft: "Draft",
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const TASK_WORK_PAYMENT_TYPE_LABEL: Record<TaskWorkPaymentType, string> = {
  // Every payment toward a contract is just a "Payment" toward the balance —
  // there is no user-facing Advance / Part-payment / Settle distinction anymore
  // (all new payments write `advance`). The final_settlement / retention labels
  // are kept only so any legacy rows already in the DB still render sensibly.
  advance: "Payment",
  part_payment: "Payment",
  final_settlement: "Final settlement",
  retention_release: "Retention release",
};

export const TASK_WORK_PAYMENT_MODE_LABEL: Record<TaskWorkPaymentMode, string> = {
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  other: "Other",
};

export const TASK_WORK_UNIT_LABEL: Record<TaskWorkMeasurementUnit, string> = {
  sqft: "sq ft",
  rft: "rft",
  nos: "nos",
  lumpsum: "lump sum",
  per_point: "point",
};
