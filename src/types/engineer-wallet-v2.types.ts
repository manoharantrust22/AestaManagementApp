/**
 * Engineer Wallet v2 — Types
 *
 * v2 model: simple running balance per engineer. No batches, no per-deposit allocation.
 * Balance = SUM(deposit) − SUM(spend) − SUM(return), computed live by v_engineer_wallet_balance.
 *
 * These types are intentionally decoupled from `Database` (database.types.ts) until the
 * generated types are refreshed against the v2 schema. Once Phase 2/3 ships, regenerate
 * and migrate these to the canonical Row/Insert/Update types.
 */

export type WalletTransactionType = "deposit" | "spend" | "return";
export type WalletPaymentMode = "cash" | "upi" | "bank_transfer";
export type WalletPaymentChannel = "direct" | "engineer_wallet";

/** Canonical payer source keys mirrored from the payer_sources registry + legacy compat. */
export type WalletPayerSourceKey =
  | "own_money"
  | "amma_money"
  | "client_money"
  | "trust_account"
  | "other_site_money"
  | "custom"
  | "mothers_money"; // legacy back-compat

/** One row of site_engineer_transactions in the v2 model. */
export interface WalletLedgerEntry {
  id: string;
  user_id: string;
  transaction_type: WalletTransactionType;
  amount: number;
  transaction_date: string; // YYYY-MM-DD
  site_id: string | null;
  description: string | null;
  payment_mode: WalletPaymentMode;
  proof_url: string | null;
  notes: string | null;
  payer_source: WalletPayerSourceKey | null;
  payer_name: string | null;
  recorded_by: string;
  recorded_by_user_id: string | null;
  created_at: string;
  updated_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancelled_by_user_id: string | null;
  cancellation_reason: string | null;
}

/** Live wallet balance + activity counters from v_engineer_wallet_balance.
 *  Keyed by (user_id, site_id) — every engineer has one pool per site. */
export interface WalletBalance {
  user_id: string;
  site_id: string;
  balance: number;
  last_txn_at: string | null;
  deposit_count: number;
  spend_count: number;
  return_count: number;
  total_deposited: number;
  total_spent: number;
  total_returned: number;
}

/** Per-site balance row decorated with the site's display name, used by the
 *  office detail panel (one card per site). Sites with no ledger rows yet
 *  are still surfaced (zero-filled) so operators can deposit into a fresh site. */
export interface EngineerSiteBalance {
  site_id: string;
  site_name: string;
  balance: number;
  last_txn_at: string | null;
  total_deposited: number;
  total_spent: number;
  total_returned: number;
}

/** A wallet-enabled engineer (from company_members.wallet_enabled = true). */
export interface WalletEnabledEngineer {
  user_id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  company_id: string;
  /** Sum across all sites — convenience for the engineer-list rail. */
  total_balance: number;
  last_txn_at: string | null;
  /** Per-site breakdown. Includes every active site of the engineer's company. */
  sites: EngineerSiteBalance[];
}

/** Inputs to recordDeposit. UPI mode requires proof_url. site_id is required —
 *  every deposit is tagged to a specific site pool. */
export interface RecordDepositInput {
  engineer_id: string;
  site_id: string;
  amount: number;
  payment_mode: WalletPaymentMode;
  payer_source: WalletPayerSourceKey;
  payer_name: string | null;
  proof_url: string | null;
  transaction_date?: string;
  description?: string | null;
  notes?: string | null;
  recorded_by: string;
  recorded_by_user_id: string;
}

/** Inputs to recordReturn. UPI mode requires proof_url. site_id is required —
 *  returns decrement the specific site pool that money is being handed back from. */
export interface RecordReturnInput {
  engineer_id: string;
  site_id: string;
  amount: number;
  payment_mode: WalletPaymentMode;
  proof_url?: string | null;
  transaction_date?: string;
  description?: string | null;
  notes?: string | null;
  recorded_by: string;
  recorded_by_user_id: string;
}

/** Inputs to recordSpend. Called only by domain settlement services. site_id is
 *  the settlement's site — the RPC enforces that pool is sufficient. */
export interface RecordSpendInput {
  engineer_id: string;
  site_id: string;
  amount: number;
  payment_mode: WalletPaymentMode;
  proof_url?: string | null;
  transaction_date?: string;
  description?: string | null;
  notes?: string | null;
  recorded_by: string;
  recorded_by_user_id: string;
}

/** Filters for getWalletLedger. Cursor-paginated. */
export interface WalletLedgerFilters {
  type?: WalletTransactionType | "all";
  date_from?: string | null;
  date_to?: string | null;
  site_id?: string | null;
  /** Cursor: { transaction_date, id } from the last seen row. */
  cursor?: { transaction_date: string; id: string } | null;
  /** Page size, default 30. */
  limit?: number;
}

export interface WalletLedgerPage {
  rows: WalletLedgerEntry[];
  next_cursor: { transaction_date: string; id: string } | null;
}

/** Thrown by service-level validation (mode/proof rule, missing fields). Caller maps to UI. */
export class WalletValidationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "WalletValidationError";
  }
}

/** Thrown when atomic_record_wallet_spend rejects an over-spend (PG error code WLT01). */
export class WalletInsufficientBalanceError extends Error {
  readonly available: number;
  readonly requested: number;
  constructor(available: number, requested: number) {
    super(`Insufficient wallet balance: have ${available}, need ${requested}`);
    this.available = available;
    this.requested = requested;
    this.name = "WalletInsufficientBalanceError";
  }
}
