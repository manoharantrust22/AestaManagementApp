import type { PayerSourceSplitRow } from "@/types/settlement.types";

/** Subset of a purchase_orders row needed to materialize an expense at advance time. */
export interface AdvancePoForExpense {
  id: string;
  site_id: string;
  /** Cluster id stamped on group POs at creation. Carried onto the expense row
   *  even when the group-stock notes marker is absent — the Hub's settlement
   *  query matches cluster mates via site_group_id, so dropping it makes the
   *  settlement invisible on every other site. */
  site_group_id?: string | null;
  po_number?: string | null;
  vendor_id?: string | null;
  vendor?: { name?: string | null } | null;
  total_amount?: number | null;
  transport_cost?: number | null;
  items?: Array<{
    material_id: string;
    brand_id?: string | null;
    quantity: number;
    unit_price: number;
  }> | null;
  internal_notes?: unknown;
}

/** Payment + payer inputs. Payer fields are already normalized via toRpcArgs(). */
export interface AdvancePaymentArgs {
  amount_paid: number;
  payment_date: string;
  payment_mode?: string;
  payment_reference?: string;
  payment_screenshot_url?: string;
  notes?: string;
  payer_source?: string;
  payer_name?: string | null;
  payer_source_split?: PayerSourceSplitRow[] | null;
  /** True when the dialog knows this is a full bulk settlement (isGroupStockAdvancePO). */
  is_complete?: boolean;
  /**
   * Settlement reference (PSET-…) to stamp when this advance is actually a FINAL
   * settlement (is_complete / fully paid). Minted by the caller only for final
   * settlements so the row reads "settled" (not merely "paid") on the site-level
   * SettlementsTab. Null/omitted for genuine partial advances.
   */
  settlement_reference?: string | null;
  payment_channel: "direct" | "engineer_wallet";
  /** Explicit group-stock paying-site override (from dialog / PO notes). */
  paying_site_id?: string | null;
  /** Explicit site group id override (from dialog / PO notes). */
  site_group_id?: string | null;
  /** Optional subcontract this material was bought under (null = unlinked). */
  subcontract_id?: string | null;
}

export interface BuiltAdvanceExpense {
  expenseRow: Record<string, unknown>;
  /** Items WITHOUT purchase_expense_id — caller stamps it after the row insert. */
  expenseItems: Array<{
    material_id: string;
    brand_id: string | null;
    quantity: number;
    unit_price: number;
  }>;
  isGroupStock: boolean;
}

export function parsePoNotes(internalNotes: unknown): {
  is_group_stock?: boolean;
  site_group_id?: string;
  group_id?: string;
  payment_source_site_id?: string;
} | null {
  if (!internalNotes) return null;
  try {
    return typeof internalNotes === "string"
      ? JSON.parse(internalNotes)
      : (internalNotes as Record<string, unknown>);
  } catch {
    return null;
  }
}

/**
 * Build the material_purchase_expenses row (+ line items) for an advance / bulk
 * settlement. Mirrors the delivery-flow expense shape so the delivery skip-guard
 * treats the early row as authoritative. Pure — no I/O — so it is unit-testable.
 */
export function buildAdvanceExpensePayload(
  po: AdvancePoForExpense,
  args: AdvancePaymentArgs,
  refCode: string,
  createdByAuthId: string | null,
): BuiltAdvanceExpense {
  const notes = parsePoNotes(po.internal_notes);
  const isGroupStock = notes?.is_group_stock === true;
  // Fall back to the PO row's own cluster id: group POs created without the
  // is_group_stock notes marker still need site_group_id on the expense, or
  // the settlement reads "settled" on the recording site but "pending" on
  // every cluster mate.
  const siteGroupId =
    args.site_group_id ??
    notes?.site_group_id ??
    notes?.group_id ??
    po.site_group_id ??
    null;
  const totalAmount = Number(po.total_amount ?? args.amount_paid);
  const totalQty = (po.items ?? []).reduce((sum, it) => sum + Number(it.quantity || 0), 0);
  // Guard the equality branch so a degenerate 0-of-0 advance isn't marked paid.
  const isFullyPaid =
    !!args.is_complete || (totalAmount > 0 && args.amount_paid >= totalAmount);
  const payingSiteId = isGroupStock
    ? (args.paying_site_id ?? notes?.payment_source_site_id ?? po.site_id)
    : null;

  const expenseRow: Record<string, unknown> = {
    site_id: po.site_id,
    ref_code: refCode,
    purchase_type: isGroupStock ? "group_stock" : "own_site",
    purchase_order_id: po.id,
    vendor_id: po.vendor_id ?? null,
    vendor_name: po.vendor?.name ?? null,
    purchase_date: args.payment_date,
    total_amount: totalAmount,
    transport_cost: po.transport_cost ?? 0,
    status: "recorded",
    is_paid: isFullyPaid,
    paid_date: isFullyPaid ? args.payment_date : null,
    // When this advance is actually a FINAL settlement (is_complete / fully paid),
    // promote it to a settled row: stamp the settlement ref + date so the
    // site-level SettlementsTab (status: settlement_reference ? "settled" : "paid")
    // agrees with the Hub. Left null for genuine partial advances.
    settlement_reference: isFullyPaid ? (args.settlement_reference ?? null) : null,
    settlement_date: isFullyPaid ? args.payment_date : null,
    payment_mode: args.payment_mode ?? "cash",
    payment_reference: args.payment_reference ?? null,
    payment_screenshot_url: args.payment_screenshot_url ?? null,
    amount_paid: args.amount_paid,
    notes: args.notes ?? `Advance payment for PO ${po.po_number ?? po.id}`,
    paying_site_id: payingSiteId,
    // Always carry the cluster id (not only for group_stock): it scopes the
    // expense's cross-site VISIBILITY, while purchase_type alone drives the
    // group-stock inventory machinery.
    site_group_id: siteGroupId,
    // null when items aren't populated yet (quantity-unknown advance)
    original_qty: isGroupStock ? (totalQty > 0 ? totalQty : null) : null,
    remaining_qty: isGroupStock ? (totalQty > 0 ? totalQty : null) : null,
    payment_channel: args.payment_channel,
    settlement_payer_source: args.payer_source ?? null,
    settlement_payer_name: args.payer_name ?? null,
    payer_source_split: args.payer_source_split ?? null,
    subcontract_id: args.subcontract_id ?? null,
    created_by: createdByAuthId,
  };

  const expenseItems = (po.items ?? []).map((it) => ({
    material_id: it.material_id,
    brand_id: it.brand_id ?? null,
    quantity: it.quantity,
    unit_price: it.unit_price,
  }));

  return { expenseRow, expenseItems, isGroupStock };
}
