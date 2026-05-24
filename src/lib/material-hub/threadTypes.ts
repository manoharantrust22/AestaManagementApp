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
  expected: string | null;
  status: "ordered" | "partial" | "delivered" | string;
  payer_site_id: string;
  advance?: {
    total_paid: number;
    batches: { date: string; qty: number }[];
    next_batch?: string | null;
  };
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
}

export interface ThreadInventory {
  batch: string;
  received: number;
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
  inter_site_usage?: ThreadInterSiteUsage[];

  // Spot-only
  bought_at?: string;
  spot_stage?: SpotStage;
  spot?: ThreadSpot;
}
