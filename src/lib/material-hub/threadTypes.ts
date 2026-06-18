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

import type { PayerSourceSplitRow } from "@/types/settlement.types";
import type { InterSiteStatus } from "@/lib/material-hub/interSiteStatus";

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
  /** True when any PO line is weight-priced (pricing_mode='per_kg', e.g. TMT).
   *  For these, `amount` becomes the delivered bill ACTUAL once delivered (the
   *  PO total is overwritten on delivery), and the estimate-vs-actual delta is
   *  weight variance — NOT a negotiated discount — so the Hub must NOT render a
   *  "BARGAINED · saved" badge for them. */
  weight_based: boolean;
  qty: number;
  /** Total received across all delivery batches (sum of PO items' received_qty). */
  received_qty: number;
  expected: string | null;
  status: "ordered" | "partial" | "delivered" | string;
  /** REAL payer — the site whose money funded the buy (group POs); falls back
   *  to the PO's own site for non-group POs. May differ from debtor_site_id. */
  payer_site_id: string;
  payer_site_name?: string;
  /** Originating / requesting site that owes the payer (group POs). */
  debtor_site_id?: string;
  debtor_site_name?: string;
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
  /** Cluster site this batch physically landed at (deliveries.site_id). For a
   *  group batch, deliveries can split across sites — used to attribute per-GRN
   *  usage to the right site's consumption. */
  site_id?: string | null;
  /** Qty consumed from THIS delivery, from the persisted FIFO allocations
   *  (batch_usage_delivery_allocations). 0 when nothing drawn yet. Drives the
   *  per-GRN "used / received" indicator. */
  used_qty?: number;
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
  /** When paid_by === "wallet", the engineer whose wallet funded the vendor
   *  payment (site_engineer_transactions.recorded_by). Lets the card read
   *  "Paid by wallet · Ajith Kumar" instead of an anonymous wallet. */
  paid_by_engineer_name?: string | null;
  settled_at?: string | null;
  /** Audit: display name of the user who marked the expense paid (from
   *  material_purchase_expenses.settled_by, resolved to public.users.name).
   *  Null for pre-audit historical rows. Lets the card read
   *  "Settled by Ajith Kumar · 12 Jun 26" instead of an anonymous date. */
  settled_by_name?: string | null;
  /** Human-readable ref_code on the material_purchase_expenses row (e.g. "MAT-260214-6805").
   *  Surfaced in the Expenses block so the user can find the row on /site/expenses. */
  expense_ref?: string | null;
  /** UUID of the material_purchase_expenses row (for future deep-link navigation). */
  expense_id?: string | null;
  /** False for group_stock parents: v_all_expenses excludes them (the per-site
   *  usage allocations are the ledger rows), so a /site/expenses?c_ref= link
   *  would land on an empty filter. */
  expense_on_ledger?: boolean;
  /** Payment mode used at settlement (upi / cash / bank_transfer / other).
   *  Renders as a small chip next to the settled amount. */
  payment_mode?: string | null;
  /** UPI / bank transfer payment proof attached at settlement time. */
  payment_screenshot_url?: string | null;
  /** Vendor bill scan attached to the expense (separate from PO.vendor_bill_url
   *  which is captured at PO time). */
  bill_url?: string | null;
  /** Site whose money paid the vendor. From material_purchase_expenses.
   *  paying_site_id (group-stock purchases), falling back to the site that
   *  recorded the expense. Rendered as a "Paying site" row on group cards. */
  paying_site_id?: string | null;
  paying_site_name?: string | null;
  /** Payment source attribution — which fund paid the vendor. Mirrors
   *  material_purchase_expenses.settlement_payer_source / _name / payer_source_split.
   *  Rendered as a "Source" row on the settlement card so the payer is visible
   *  without opening the Edit Settlement dialog. */
  payer_source?: string | null;
  payer_name?: string | null;
  payer_source_split?: PayerSourceSplitRow[] | null;
}

export interface ThreadInventory {
  batch: string;
  received: number;
  used: number;
  remaining: number;
  /** Per-site received/used split for a GROUP batch — one entry per cluster
   *  site that received or used it. Populated for any group batch (including
   *  single-site) so a cluster-wide roll-up reconciles with the headline;
   *  undefined for own-site batches. The Hub expanded card only renders its
   *  segmented bar when there is more than one site.
   *  Lets the Hub show "Padmavathy 40 recv · 21.5 used / Srinivasan 30 · 3.5"
   *  so totals reconcile against the material usage ledger. */
  per_site?: Array<{
    site_id: string;
    site_name: string;
    received: number;
    used: number;
    /** Live current_qty held on this site's stock row (Σ reconciles to the
     *  batch's headline remaining). Optional for older callers. */
    remaining?: number;
  }>;
}

/**
 * Per-variant breakdown for multi-line POs (e.g. one PO covering TMT Rods
 * 16mm + 12mm + 8mm). Used by the hub card title ("3 sizes" + chips) and by
 * the expanded inventory block to surface variant-level used/remaining.
 * Live used/remaining come from get_batch_variant_summary; requested_qty is
 * from material_request_items so it works pre-PO too.
 */
export interface ThreadVariant {
  material_id: string;
  material_name: string;
  unit: string;
  brand_id?: string | null;
  brand_name?: string | null;
  requested_qty: number;
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
  /** Raised on a different site than the viewer (covers both true mirrors AND
   *  cluster group threads) — drives the "Requested by <site>" label. */
  is_sibling_request?: boolean;
  mirrored_from_site_id?: string;
  mirrored_from_site_name?: string;

  // Lifecycle
  stage: ThreadStage;
  kind: ThreadKind;
  /** A group ("cluster") buy that ended up fully consumed by the paying site
   *  itself — no cross-site usage at all. Drives the "used fully by own site"
   *  badge so the user knows it was ordered as a group but never shared. */
  is_group_self_used?: boolean;
  /** For an `is_group_self_used` batch: the own_site SELF-USE material expense
   *  that has been posted for it, if any. Null/undefined → not yet posted, so
   *  the Hub shows a "Push to material expense" action; present → the Hub shows
   *  a clickable "Recorded · <ref>" deep-link into /site/expenses. Posting is
   *  manual (the silent auto-trigger was dropped in migration 20260601130000). */
  self_use_expense?: { ref_code: string; amount: number } | null;
  advance: boolean;

  // Material (primary, when multi-line)
  material_id: string;
  material_name: string;
  material_unit: string;
  /** Brand of the primary line item, when known. Multi-line brands live on
   *  `variants[]`; this surfaces the single-line brand so the Hub's brand
   *  filter can match single-item threads too. */
  brand_id?: string | null;
  brand_name?: string | null;
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
  variants?: ThreadVariant[];
  /** Site-wide pool stats for own-site (shared-bucket) threads. Populated
   *  alongside the "Added to stock" fallback so the Hub can render a
   *  completion signal (e.g. "Pool exhausted") without faking per-PO numbers. */
  pool?: ThreadPoolState;
  inter_site_usage?: ThreadInterSiteUsage[];
  /** Group thread that has ANY cross-site usage on its batch (settled or not).
   *  Drives whether the synthetic "INTER-SITE" pipeline step renders. */
  inter_site_applicable?: boolean;
  /** Cross-site debt on this batch is still unfinished — i.e. not fully settled
   *  (`inter_site_status` is `pending_usage` or `raised_unpaid`). Derived alias
   *  of `inter_site_status`; kept for the routing/KPI callers that only need a
   *  boolean. Drives the amber step + "needs action" gate. */
  inter_site_pending?: boolean;
  /** Full inter-site lifecycle state of this batch's cross-site debt. Unlike the
   *  old boolean, this distinguishes a settlement that was merely RAISED
   *  (`raised_unpaid` — no money moved, no per-site expense) from one that is
   *  actually `settled`. Drives the honest stepper chip + next-action label. */
  inter_site_status?: InterSiteStatus;

  // Spot-only
  bought_at?: string;
  spot_stage?: SpotStage;
  spot?: ThreadSpot;
}
