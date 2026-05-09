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
  title: string;
  laborTrackingMode: LaborTrackingMode;
  isInHouse: boolean;
  contractType: "mesthri" | "specialist";
  status: ContractStatus;
  totalValue: number;
  /** Joined: team.leader_name (mesthri) or laborer.name (specialist). Null for in-house. */
  mesthriOrSpecialistName: string | null;
  createdAt: string;
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
