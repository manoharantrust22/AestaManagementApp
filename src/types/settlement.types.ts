// Settlement notification types

export type SettlementStatus =
  | "pending_settlement"
  | "pending_confirmation"
  | "confirmed"
  | "disputed";

export type SettlementMode = "upi" | "cash";

// Payer source - tracks whose money was used for settlement
export type PayerSource = "own_money" | "amma_money" | "client_money" | "other_site_money" | "custom" | "mothers_money" | "trust_account";

/**
 * True when the picker's selected source requires the user to type
 * a payer name (e.g. "Other" needs a free-text payer name; "Other Site"
 * needs a site name). Mirrors the inline guard pattern that was
 * duplicated across 5 callsites in settlementService.ts before this
 * helper existed. Slice 2 of the payer-source registry will replace
 * the hardcoded body with a registry lookup of the row's
 * `requires_name` column.
 */
export function requiresPayerName(source: string): boolean {
  return source === "custom" || source === "other_site_money";
}

export interface PayerInfo {
  source: PayerSource;
  customName?: string;
}

// Settlement context for unified dialog
export type SettlementContext = "daily_single" | "weekly";

// Settlement type selection (for weekly settlement)
export type SettlementTypeSelection = "all" | "daily" | "contract" | "market";

// Record to be settled
export interface SettlementRecord {
  id: string;
  sourceType: "daily" | "market";
  sourceId: string;
  laborerName: string;
  laborerType: "daily" | "market" | "contract";
  amount: number;
  date: string;
  isPaid: boolean;
  role?: string;
  category?: string;
  count?: number; // For market laborers
}

// Configuration for unified settlement dialog
export interface UnifiedSettlementConfig {
  context: SettlementContext;
  // Date info
  date?: string; // For single date
  dateRange?: { from: string; to: string }; // For weekly
  weekLabel?: string;
  // Records to settle
  records: SettlementRecord[];
  // Pre-computed totals
  totalAmount: number;
  pendingAmount: number;
  // By type breakdowns (pending amounts)
  dailyLaborPending: number;
  contractLaborPending: number;
  marketLaborPending: number;
  // Allow partial type settlement (for weekly)
  allowTypeSelection: boolean;
  // Optional subcontract linking
  defaultSubcontractId?: string;
}

export type PaymentSettlementNotificationType =
  | "payment_settlement_pending"
  | "payment_settlement_completed";

export interface SettlementTransaction {
  id: string;
  amount: number;
  description: string | null;
  transaction_date: string;
  settlement_status: SettlementStatus | null;
  settlement_mode: SettlementMode | null;
  settlement_proof_url: string | null;
  settlement_reason: string | null;
  user_id: string;
  site_id: string | null;
  engineer_name?: string;
  site_name?: string;
}

export interface SettlementLaborerDetail {
  id: string;
  laborer_name: string;
  amount: number;
  date: string;
  type: "daily" | "market";
}

export interface SettlementFormData {
  transactionId: string;
  settlementMode: SettlementMode;
  proofUrl?: string;
  reason?: string;
}

export interface PendingSettlement {
  id: string;
  amount: number;
  description: string | null;
  transaction_date: string;
  site_name: string | null;
  laborer_count?: number;
}

// Notification type extensions
export interface PaymentSettlementNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  notification_type: PaymentSettlementNotificationType;
  is_read: boolean;
  read_at: string | null;
  related_id: string; // transaction_id
  related_table: "site_engineer_transactions";
  created_at: string;
}

// Settlement Group - single source of truth for salary settlements
export interface SettlementGroup {
  id: string;
  settlement_reference: string;
  site_id: string;
  settlement_date: string;
  total_amount: number;
  laborer_count: number;
  payment_channel: "direct" | "engineer_wallet";
  payment_mode: string | null;
  payer_source: PayerSource | null;
  payer_name: string | null;
  proof_url: string | null;
  notes: string | null;
  subcontract_id: string | null;
  engineer_transaction_id: string | null;
  is_cancelled: boolean;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancelled_by_user_id: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  created_by_name: string | null;
}

// Unified expense record from v_all_expenses view
export interface UnifiedExpense {
  id: string;
  site_id: string;
  date: string;
  amount: number;
  description: string | null;
  category_id: string | null;
  category_name: string | null;
  module: string;
  is_cleared: boolean;
  cleared_date: string | null;
  contract_id: string | null;
  subcontract_title: string | null;
  site_payer_id: string | null;
  payer_name: string | null;
  payment_mode: string | null;
  vendor_name: string | null;
  receipt_url: string | null;
  paid_by: string | null;
  entered_by: string | null;
  entered_by_user_id: string | null;
  settlement_reference: string | null;
  settlement_group_id: string | null;
  source_type: "expense" | "settlement";
  source_id: string;
  created_at: string;
  is_deleted: boolean;
}

// A single row of a multi-source split.
// `name` is required when requiresPayerName(source) is true.
export type PayerSourceSplitRow = {
  source: PayerSource;
  name?: string;
  amount: number;
};

// Discriminated union returned by PayerSourceSplitInput and consumed by
// every writer that previously took { payerSource, customPayerName }.
export type PayerSourceInput =
  | { mode: "single"; source: PayerSource; name?: string }
  | { mode: "split"; rows: PayerSourceSplitRow[] };
