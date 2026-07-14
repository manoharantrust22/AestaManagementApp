/**
 * Weekly Payout Console types — the client mirror of get_weekly_payout_console /
 * pay_laborer_weekly_payout (migrations 20260714100100 / 20260714100300).
 */

export type PayoutBucketKind = "company_salary" | "contract";
export type PayoutContractRefKind = "task_work" | "subcontract";

export interface PayoutBucket {
  siteId: string;
  siteName: string;
  kind: PayoutBucketKind;
  refKind: PayoutContractRefKind | null;
  refId: string | null;
  title: string;
  trade: string | null;
  /** Per-contract "Deduct maistry commission" flag; null for company buckets. */
  commissionApplies: boolean | null;
  daysWeek: number;
  grossWeek: number;
  commissionWeek: number;
  netWeek: number;
  thisWeekUnpaid: number;
  earlierUnpaid: number;
  totalUnpaid: number;
  paidTotal: number;
}

export interface PayoutBatchBucketResult {
  site_id: string;
  kind: PayoutBucketKind;
  ref_kind: PayoutContractRefKind | null;
  ref_id: string | null;
  settlement_group_id: string;
  settlement_reference: string;
  requested: number;
  recorded: number;
}

export interface PayoutBatch {
  id: string;
  paymentDate: string;
  totalAmount: number;
  paymentMode: string | null;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
  bucketsResult: PayoutBatchBucketResult[];
}

export interface PayoutLaborer {
  laborerId: string;
  name: string;
  role: string | null;
  photoUrl: string | null;
  advanceOutstanding: number;
  totalUnpaid: number;
  daysWeek: number;
  buckets: PayoutBucket[];
  batches: PayoutBatch[];
}

export interface PayoutConsoleData {
  weekStart: string;
  weekEnd: string;
  laborers: PayoutLaborer[];
}

/** One bucket of a payout submission (pay_laborer_weekly_payout p_buckets element). */
export interface PayBucketInput {
  siteId: string;
  kind: PayoutBucketKind;
  contractRefKind?: PayoutContractRefKind;
  contractRefId?: string;
  amount: number;
  payerSource: string;
  payerName?: string | null;
}

export interface PayLaborerPayoutConfig {
  laborerId: string;
  weekStart: string;
  weekEnd: string;
  paymentDate: string;
  paymentMode: string;
  notes?: string | null;
  proofUrls?: string[] | null;
  buckets: PayBucketInput[];
}

export interface PayoutResultBucket {
  site_id: string;
  kind: PayoutBucketKind;
  ref_kind: PayoutContractRefKind | null;
  ref_id: string | null;
  settlement_group_id: string;
  settlement_reference: string;
  requested: number;
  recorded: number;
}

export interface PayLaborerPayoutResult {
  batch_id: string;
  total_requested: number;
  total_recorded: number;
  buckets: PayoutResultBucket[];
  idempotent_replay: boolean;
}
