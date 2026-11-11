/**
 * Review queue (maker/checker). Mirrors supabase/migrations/20261108110000_review_flags.sql.
 * Anyone may raise a flag; admin/office resolve it.
 */

export type ReviewEntityType =
  | "purchase_document"
  | "purchase_expense"
  | "vendor"
  | "material"
  | "payment";

export type ReviewReason =
  | "vendor_name_added"
  | "paid_above_billed"
  | "low_confidence_extraction"
  | "possible_duplicate"
  | "unmatched_line"
  | "data_correction"
  | "other";

export type ReviewStatus = "open" | "approved" | "rejected" | "fixed";

export interface ReviewFlag {
  id: string;
  company_id: string | null;
  site_id: string | null;
  entity_type: ReviewEntityType;
  entity_id: string;
  reason: ReviewReason;
  details: Record<string, unknown>;
  status: ReviewStatus;
  source_action_id: string | null;
  raised_by: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  site?: { id: string; name: string } | null;
  raiser?: { id: string; name: string } | null;
  resolver?: { id: string; name: string } | null;
}

/** Live values of the flagged purchase, so the reviewer sees whether it is already corrected. */
export interface FlaggedPurchaseSnapshot {
  id: string;
  ref_code: string | null;
  vendor_name: string | null;
  purchase_date: string | null;
  total_amount: number;
  amount_paid: number | null;
  transport_cost: number | null;
}

export const REVIEW_REASON_LABEL: Record<ReviewReason, string> = {
  vendor_name_added: "Vendor name added later",
  paid_above_billed: "Paid more than billed",
  low_confidence_extraction: "Low-confidence bill reading",
  possible_duplicate: "Possible duplicate",
  unmatched_line: "Unmatched bill line",
  data_correction: "Data correction",
  other: "Other",
};

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  open: "Open",
  approved: "Approved",
  rejected: "Rejected",
  fixed: "Fixed",
};
