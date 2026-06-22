/**
 * UI-shaped types for the multi-trade workspaces feature.
 *
 * Hand-rolled (not generated) so they don't churn when the DB schema gains
 * unrelated fields. The hook layer narrows raw rows from `subcontracts` /
 * `labor_categories` into these shapes before handing them to components.
 *
 * Spec: docs/superpowers/specs/2026-05-02-trade-workspaces-design.md
 */

export type LaborTrackingMode = "detailed" | "headcount" | "mesthri_only" | "mid";

export type ContractStatus =
  | "draft"
  | "active"
  | "on_hold"
  | "completed"
  | "cancelled";

export interface TradeCategory {
  id: string;
  name: string;
  isSystemSeed: boolean;
  isActive: boolean;
}

export interface TradeContract {
  id: string;
  siteId: string;
  tradeCategoryId: string | null;
  /** Optional Stage grouping (e.g. "First Floor"). Null = directly under the Contract. */
  stageId: string | null;
  title: string;
  laborTrackingMode: LaborTrackingMode;
  isInHouse: boolean;
  contractType: "mesthri" | "specialist";
  status: ContractStatus;
  totalValue: number;
  /**
   * Supervisor-set % of this task work that is complete (0–100), or null when not
   * tracked yet. Drives the Workforce exposure meter (paid vs value of work done).
   * Null → the meter shows a neutral "set progress" state instead of a verdict.
   */
  workProgressPercent: number | null;
  /** FK to the crew/team that holds this contract (the contractor-grouping key). Null if unset. */
  teamId: string | null;
  /** FK to a single laborer when the contract is held by a person, not a team. Null if unset. */
  laborerId: string | null;
  /** Joined: team.leader_name (mesthri) or laborer.name (specialist) or free-typed contractor_name. Null for in-house. */
  mesthriOrSpecialistName: string | null;
  /**
   * Self-reference: when set, this contract is a CHILD (e.g. a floor) of a combined
   * parent contract. Null = a top-level contract. Set by promote_to_parent_contract().
   */
  parentSubcontractId: string | null;
  createdAt: string;
}

/**
 * A Stage is an optional grouping of task works under a Contract (trade) on a site,
 * e.g. "Ground Floor" / "First Floor". Pure organisation — no money, no attendance.
 * Maps to the `work_stages` table; task works reference it via `subcontracts.stage_id`.
 */
export interface WorkStage {
  id: string;
  siteId: string;
  tradeCategoryId: string | null;
  name: string;
  sortOrder: number;
  createdAt: string;
}

export interface WorkStageInput {
  name: string;
  sortOrder?: number;
}

/**
 * A Trade is a category + the contracts on this site for it. The hub renders
 * one card per Trade. v1 expects 0–1 active contracts per trade per site
 * (single-active-per-trade); the array shape stays forward-compatible with
 * v2's multi-concurrent.
 */
export interface Trade {
  category: TradeCategory;
  contracts: TradeContract[];
}

/**
 * Per-contract reconciliation snapshot from v_subcontract_reconciliation.
 * Hub cards show quoted/paid/balance and the variance traffic light.
 */
export interface ContractReconciliation {
  subcontractId: string;
  quotedAmount: number;
  amountPaid: number;
  amountPaidSubcontractPayments: number;
  amountPaidSettlements: number;
  impliedLaborValueDetailed: number;
  impliedLaborValueHeadcount: number;
}

/** Days worked count derived from daily_attendance + subcontract_payments dates. */
export interface ContractActivity {
  subcontractId: string;
  /** Distinct date count from daily_attendance (detailed mode). */
  attendanceDays: number;
  /** Distinct date count from subcontract_payments (mesthri-only / proxy when no attendance). */
  paymentDays: number;
}
