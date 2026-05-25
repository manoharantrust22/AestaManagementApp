/**
 * MaterialThread — the flat, lifecycle-aware view of a material from request
 * to expense. Mirrors the prototype's Thread schema. Production sourcing:
 *
 *   - material_requests (+ items + linked POs)          → standard threads
 *   - material_purchase_expenses (purchase_type='spot') → spot threads
 *   - purchase_orders / deliveries / stock_inventory / inter_site_settlements
 *     populate the lifecycle records below as the thread advances.
 *
 * useMaterialThreads() composes these into MaterialThread[] in memory.
 */

export type ThreadStage =
  | "requested"
  | "approved"
  | "ordered"
  | "in-transit"
  | "delivered"
  | "settled"
  | "in-use"
  | "exhausted"
  | "rejected";

export type ThreadKind = "own" | "group";

export type ThreadPriority = "low" | "normal" | "high" | "urgent";

export type ThreadQuality = "good" | "fair" | "poor";

export type SpotStage = "bought" | "provisional" | "finalized";

export interface ThreadPO {
  id: string;
  po_number: string;
  vendor_id: string;
  vendor_name?: string;
  amount: number;
  qty: number;
  /** Total received across all delivery batches (sum of PO items' received_qty). */
  received_qty: number;
  expected: string | null;
  status: "ordered" | "partial" | "delivered" | string;
  payer_site_id: string;
  /** "advance" = vendor paid upfront at PO creation; "on_delivery" = paid post-delivery. */
  payment_timing: "advance" | "on_delivery";
  /** Amount already paid against this PO (advance settlement). 0 if not yet paid. */
  advance_paid: number;
  /** Vendor bill / invoice scan attached at PO time (if any). Surfaced as a
   *  paperclip icon in the Hub expanded PO block so the engineer can verify
   *  the bill without leaving the page. */
  vendor_bill_url?: string | null;
  /** Quotation document attached at PO time (rarely populated, but used by some
   *  POs during the procurement step). */
  quotation_url?: string | null;
  /**
   * Per-batch delivery log against this PO. One row per `deliveries` record
   * (filtered to the primary material). Empty array = no deliveries recorded
   * yet. Used by the expanded view to render the batch-by-batch GRN list.
   */
  delivery_batches: ThreadDeliveryBatch[];
  advance?: {
    total_paid: number;
    batches: { date: string; qty: number }[];
    next_batch?: string | null;
  };
}

export interface ThreadDeliveryBatch {
  id: string;
  grn_number: string;
  delivery_date: string;
  received_qty: number;
  accepted_qty: number;
  verified: boolean;
  vehicle_number?: string | null;
  notes?: string | null;
  /** Vendor invoice / challan scans attached at delivery time (if any). The Hub
   *  shows a paperclip per batch when set, so engineers can verify the paper
   *  trail without leaving the row. */
  invoice_url?: string | null;
  challan_url?: string | null;
}

export interface ThreadDelivery {
  date: string;
  recorded_by: string | null;
  quality: ThreadQuality;
  notes: string | null;
  received_qty: number;
}

export interface ThreadSettlement {
  status: "pending" | "settled";
  amount: number;
  paid_by: "office" | "wallet" | "site" | string | null;
  settled_at?: string | null;
  /** Human-readable ref_code on the material_purchase_expenses row (e.g. "MAT-260214-6805").
   *  Surfaced in the Expenses block so the user can find the row on /site/expenses. */
  expense_ref?: string | null;
  /** UUID of the material_purchase_expenses row (for future deep-link navigation). */
  expense_id?: string | null;
  /** Payment mode used at settlement (upi / cash / bank_transfer / other).
   *  Renders as a small chip next to the settled amount. */
  payment_mode?: string | null;
  /** UPI / bank transfer payment proof attached at settlement time. */
  payment_screenshot_url?: string | null;
  /** Vendor bill scan attached to the expense (separate from PO.vendor_bill_url
   *  which is captured at PO time). */
  bill_url?: string | null;
}

export interface ThreadInventory {
  batch: string;
  received: number;
  used: number;
  remaining: number;
}

/**
 * Site-wide pool snapshot for own-site (shared-bucket) POs. Distinct from
 * per-batch `inventory` because the pool aggregates EVERY purchase of the same
 * material on this site, not just this PO. Lets the Hub render a completion
 * signal ("Pool exhausted" / "5 bag remaining in pool") for own-site threads
 * without claiming per-PO accuracy.
 */
export interface ThreadPoolState {
  used: number;
  remaining: number;
}

export interface ThreadInterSiteUsage {
  site_id: string;
  used: number;
  value: number;
}

export interface ThreadSpotItem {
  material_id: string;
  name: string;
  qty: number;
  unit: string;
  paid_rate: number;
  last_rate?: number | null;
  line_total: number;
}

export interface ThreadSpot {
  vendor_id: string;
  vendor_name: string;
  vendor_is_draft?: boolean;
  items: ThreadSpotItem[];
  paid_by: string;
  wallet_id: string;
  payment_mode: "cash" | "upi";
  amount: number;
  bill_attached: boolean;
  screenshot_attached: boolean;
  allocation?: {
    kind: "provisional" | "final";
    split: { site_id: string; pct: number }[];
    due_by?: string | null;
    finalized_at?: string | null;
  };
  rate_diverged?: boolean;
}

/**
 * Source identifies which production table this thread was derived from.
 * Used during action dispatch to route to the correct mutation.
 */
export type ThreadSource = "material_request" | "spot_purchase";

export interface MaterialThread {
  // Identity
  id: string;
  source: ThreadSource;
  purchase_type?: "spot";
  source_row_id: string;

  // Historical backfill flags (populated when material_purchase_expenses.is_historical=true)
  is_historical?: boolean;
  used_qty_at_entry?: number | null;
  /** Vendor for this thread was minted as a draft (is_draft=true). Surfaces +V tag in Hub row. */
  vendor_is_draft?: boolean;
  /** Primary material was minted as a draft. Surfaces +M tag in Hub row. */
  material_is_draft?: boolean;

  // Site/section
  site_id: string;
  section: string | null;
  section_id?: string | null;
  floor: string | null;
  priority: ThreadPriority;

  /** True when the current site is viewing a group thread that originated at a
   *  cluster-mate site. Mirror threads are read-only here — actions stay on
   *  the originator. The Hub renders a "Shared from <site>" chip + disabled
   *  action button. */
  is_mirror?: boolean;
  mirrored_from_site_id?: string;
  mirrored_from_site_name?: string;

  // Lifecycle
  stage: ThreadStage;
  kind: ThreadKind;
  advance: boolean;

  // Material (primary, when multi-line)
  material_id: string;
  material_name: string;
  material_unit: string;
  qty: number;

  // Request meta
  request_number?: string;
  requested_by: string | null;
  requested_by_name?: string;
  requested_at: string;
  need_by?: string | null;
  note?: string | null;

  // Lifecycle records (nullable, populated as the thread advances)
  approved_by?: string | null;
  approved_at?: string | null;
  rejected_reason?: string | null;

  po?: ThreadPO;
  delivery?: ThreadDelivery;
  settlement?: ThreadSettlement;
  inventory?: ThreadInventory;
  /** Site-wide pool stats for own-site (shared-bucket) threads. Populated
   *  alongside the "Added to stock" fallback so the Hub can render a
   *  completion signal (e.g. "Pool exhausted") without faking per-PO numbers. */
  pool?: ThreadPoolState;
  inter_site_usage?: ThreadInterSiteUsage[];

  // Spot-only
  bought_at?: string;
  spot_stage?: SpotStage;
  spot?: ThreadSpot;
}
