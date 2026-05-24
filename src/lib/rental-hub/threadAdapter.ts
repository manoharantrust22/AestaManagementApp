/**
 * mapRentalOrderToThread — translates the production RentalOrderWithDetails
 * row (snake_case, joined via useRentalOrders) into the UI-shaped RentalThread.
 *
 * The translation is intentionally narrow: it never queries Supabase, it just
 * renames + groups + synthesizes `effective_status`. Cost meter + overdue +
 * days-since-start are taken verbatim from the producer hook (already
 * computed). New synthesis added here:
 *
 *   - `effective_status === 'settled'` when status is 'completed' AND every
 *     required settlement party_type has a row.
 *   - `settlements` map keyed by RentalSettlementSlot, where legacy 'transport'
 *     rows fall back to whichever leg (outbound vs return) has non-zero cost.
 *   - `requiresTransportInSettlement` / `requiresTransportOutSettlement` —
 *     a transport leg requires a settlement when cost > 0 AND handler !=
 *     'vendor' (vendor-bundled transport is part of the vendor bill).
 */

import type {
  RentalAdvance,
  RentalOrderWithDetails,
  RentalReturn,
  RentalSettlement,
} from "@/types/rental.types";

import type {
  RentalEffectiveStatus,
  RentalSettlementMap,
  RentalThread,
  RentalThreadAdvance,
  RentalThreadItem,
  RentalThreadReturn,
  RentalThreadSettlement,
  RentalThreadTransport,
  RentalThreadVendor,
} from "./threadTypes";

function mapVendor(o: RentalOrderWithDetails): RentalThreadVendor | null {
  if (!o.vendor) return null;
  return {
    id: o.vendor.id,
    name: o.vendor.name,
    phone: o.vendor.phone ?? null,
    shop_name: o.vendor.shop_name ?? null,
  };
}

function mapItem(item: NonNullable<RentalOrderWithDetails["items"]>[number]): RentalThreadItem {
  return {
    id: item.id,
    rentalItemId: item.rental_item_id,
    name: item.rental_item?.name ?? "(item)",
    unit: item.rental_item?.unit ?? "",
    qty: item.quantity,
    qtyReturned: item.quantity_returned,
    qtyOutstanding: item.quantity_outstanding,
    rateType: item.rate_type,
    dailyRate: item.daily_rate_actual,
    hoursUsed: item.hours_used,
    sizeLabelSnapshot: item.size_label_snapshot,
    itemStartDate: item.item_start_date,
    itemExpectedReturnDate: item.item_expected_return_date,
  };
}

function mapAdvance(adv: RentalAdvance): RentalThreadAdvance {
  return {
    id: adv.id,
    date: adv.advance_date,
    amount: adv.amount,
    mode: adv.payment_mode,
    payerSource: adv.payer_source,
    note: adv.notes,
  };
}

function mapReturn(r: RentalReturn): RentalThreadReturn {
  return {
    id: r.id,
    date: r.return_date,
    rentalOrderItemId: r.rental_order_item_id,
    qty: r.quantity_returned,
    condition: r.condition,
    damageCost: r.damage_cost,
  };
}

function mapSettlementRow(s: RentalSettlement): RentalThreadSettlement {
  return {
    id: s.id,
    status: "settled",
    reference: s.settlement_reference,
    rentalAmount: s.total_rental_amount,
    transportAmount: s.total_transport_amount,
    damageAmount: s.total_damage_amount,
    negotiatedFinalAmount: s.negotiated_final_amount,
    totalAdvancePaid: s.total_advance_paid,
    balanceAmount: s.balance_amount,
    paymentMode: s.payment_mode,
    payerSource: s.payer_source,
    settledAt: s.settlement_date,
    settledBy: s.settled_by_name ?? s.settled_by,
    vendorBillUrl: s.vendor_bill_url,
    finalReceiptUrl: s.final_receipt_url,
    upiScreenshotUrl: s.upi_screenshot_url,
  };
}

function buildTransport(
  by: RentalOrderWithDetails["outward_by"],
  cost: number,
  loading: number,
  unloading: number,
): RentalThreadTransport {
  return {
    by,
    cost,
    loadingCost: loading,
    unloadingCost: unloading,
  };
}

/**
 * Group settlement rows by party_type. Handles the legacy 'transport' value
 * (pre-2026-05-14 split) by routing it to whichever leg has cost > 0; if both
 * legs have cost, prefer transportOut (return-leg) since it is the more
 * commonly-settled-separately leg in practice.
 */
function buildSettlementMap(
  settlements: RentalSettlement[],
  transportInCost: number,
  transportOutCost: number,
): RentalSettlementMap {
  const map: RentalSettlementMap = {};

  for (const row of settlements) {
    const mapped = mapSettlementRow(row);
    switch (row.party_type) {
      case "vendor":
        map.vendor = mapped;
        break;
      case "transport_inbound":
        map.transportIn = mapped;
        break;
      case "transport_outbound":
        map.transportOut = mapped;
        break;
      case "loading_unloading":
        map.loadingUnloading = mapped;
        break;
      case "transport": {
        // Legacy: split row into whichever leg makes sense
        const wantsOut = transportOutCost > 0;
        const wantsIn = transportInCost > 0 && !wantsOut;
        if (wantsIn) map.transportIn = mapped;
        else map.transportOut = mapped;
        break;
      }
    }
  }

  return map;
}

function requiresTransportSettlement(t: RentalThreadTransport): boolean {
  return t.cost > 0 && t.by !== null && t.by !== "vendor";
}

function computeEffectiveStatus(
  status: RentalOrderWithDetails["status"],
  settlements: RentalSettlementMap,
  requiresIn: boolean,
  requiresOut: boolean,
): RentalEffectiveStatus {
  if (status !== "completed") return status;

  const vendorDone = !!settlements.vendor;
  const inDone = !requiresIn || !!settlements.transportIn;
  const outDone = !requiresOut || !!settlements.transportOut;

  if (vendorDone && inDone && outDone) return "settled";
  return status;
}

export function mapRentalOrderToThread(o: RentalOrderWithDetails): RentalThread {
  const items = (o.items ?? []).map(mapItem);
  const advances = (o.advances ?? []).map(mapAdvance);
  const returns = (o.returns ?? []).map(mapReturn);

  const transportIn = buildTransport(
    o.outward_by,
    o.transport_cost_outward,
    o.loading_cost_outward,
    o.unloading_cost_outward,
  );
  const transportOut = buildTransport(
    o.return_by,
    o.transport_cost_return,
    o.loading_cost_return,
    o.unloading_cost_return,
  );

  const settlementMap = buildSettlementMap(
    o.settlements ?? [],
    transportIn.cost,
    transportOut.cost,
  );

  const requiresIn = requiresTransportSettlement(transportIn);
  const requiresOut = requiresTransportSettlement(transportOut);

  const effective_status = computeEffectiveStatus(
    o.status,
    settlementMap,
    requiresIn,
    requiresOut,
  );

  return {
    id: o.rental_order_number,
    source_row_id: o.id,
    site_id: o.site_id,

    status: o.status,
    effective_status,
    kind: o.parent_order_id ? "group" : "own",
    isHistorical: o.is_historical,
    isCancelled: o.status === "cancelled",

    vendor: mapVendor(o),

    orderDate: o.order_date,
    expectedStart: o.start_date,
    expectedEnd: o.expected_return_date,
    actualEnd: o.actual_return_date,
    excludeStartDate: o.exclude_start_date,
    approvedAt: o.approved_at,
    cancelledAt: o.cancelled_at,
    createdAt: o.created_at,

    items,

    transportIn,
    transportOut,

    discountPct: o.negotiated_discount_percentage,
    discountAmount: o.negotiated_discount_amount,

    advances,
    returns,
    settlements: settlementMap,

    accruedCost: o.accrued_rental_cost ?? 0,
    totalAdvancePaid: o.total_advance_paid ?? 0,
    daysSinceStart: o.days_since_start ?? 0,
    isOverdue: o.is_overdue ?? false,

    notes: o.notes,
    internalNotes: o.internal_notes,

    requiresTransportInSettlement: requiresIn,
    requiresTransportOutSettlement: requiresOut,
  };
}
