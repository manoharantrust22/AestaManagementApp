/**
 * RentalThread — the UI-shaped view of a rental order for the Rental Hub v2.
 * Mirrors the spec in docs/RentalHub_V2_redesign/README.md.
 *
 * Sourcing: produced by mapRentalOrderToThread() from RentalOrderWithDetails
 * (the rich row already returned by useRentalOrders). The hub never queries
 * tables directly — useRentalThreads composes existing query data into this
 * shape.
 *
 * Production status enum has 8 values (pending, approved, draft, confirmed,
 * active, partially_returned, completed, cancelled) but no 'settled'. The
 * adapter synthesizes `effective_status === 'settled'` when status is
 * completed AND all expected settlement party_types are present.
 */

import type {
  RentalOrderStatus,
  RentalRateType,
  ReturnCondition,
  TransportHandler,
} from "@/types/rental.types";

export type RentalStage =
  | "request"
  | "confirm"
  | "active"
  | "returned"
  | "settled";

export type RentalKind = "own" | "group";

/**
 * Synthesized status — same union as RentalOrderStatus but adds `settled`
 * for fully-paid completed orders so the UI can color them green.
 */
export type RentalEffectiveStatus = RentalOrderStatus | "settled";

export interface RentalThreadVendor {
  id: string;
  name: string;
  phone: string | null;
  shop_name: string | null;
}

export interface RentalThreadItem {
  id: string;
  rentalItemId: string;
  name: string;
  unit: string;
  qty: number;
  qtyReturned: number;
  qtyOutstanding: number;
  rateType: RentalRateType;
  dailyRate: number;
  hoursUsed: number | null;
  sizeLabelSnapshot: string | null;
  itemStartDate: string | null;
  itemExpectedReturnDate: string | null;
}

export interface RentalThreadTransport {
  by: TransportHandler | null;
  cost: number;
  loadingCost: number;
  unloadingCost: number;
}

export interface RentalThreadAdvance {
  id: string;
  date: string;
  amount: number;
  mode: string | null;
  payerSource: string | null;
  note: string | null;
}

export interface RentalThreadReturn {
  id: string;
  date: string;
  rentalOrderItemId: string;
  qty: number;
  condition: ReturnCondition;
  damageCost: number;
}

/** Settled party_types in the production rental_settlements table. */
export type RentalSettlementSlot =
  | "vendor"
  | "transportIn"
  | "transportOut"
  | "loadingUnloading";

export interface RentalThreadSettlement {
  id: string;
  status: "settled";
  reference: string | null;
  rentalAmount: number;
  transportAmount: number;
  damageAmount: number;
  negotiatedFinalAmount: number | null;
  totalAdvancePaid: number;
  balanceAmount: number;
  paymentMode: string | null;
  payerSource: string | null;
  settledAt: string;
  settledBy: string | null;
  vendorBillUrl: string | null;
  finalReceiptUrl: string | null;
  upiScreenshotUrl: string | null;
}

export type RentalSettlementMap = Partial<
  Record<RentalSettlementSlot, RentalThreadSettlement>
>;

export interface RentalThread {
  // Identity
  id: string;                 // rental_order_number, the display id
  source_row_id: string;      // rental_orders.id (UUID, for dialog handoff)
  site_id: string;

  // Lifecycle
  status: RentalOrderStatus;
  effective_status: RentalEffectiveStatus;
  kind: RentalKind;
  isHistorical: boolean;
  isCancelled: boolean;

  // Parties
  vendor: RentalThreadVendor | null;

  // Dates
  orderDate: string;
  expectedStart: string;
  expectedEnd: string | null;
  actualEnd: string | null;
  excludeStartDate: boolean;
  approvedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;

  // Items + lines
  items: RentalThreadItem[];

  // Transport (in = outward, out = return per spec)
  transportIn: RentalThreadTransport;
  transportOut: RentalThreadTransport;

  // Discount
  discountPct: number;
  discountAmount: number;

  // Mutations / history
  advances: RentalThreadAdvance[];
  returns: RentalThreadReturn[];
  settlements: RentalSettlementMap;

  // Pre-computed numbers (from useRentalOrders' map step)
  accruedCost: number;
  totalAdvancePaid: number;
  daysSinceStart: number;
  isOverdue: boolean;

  // Notes
  notes: string | null;
  internalNotes: string | null;

  // Settlement requirement flags (derived once for downstream cheap checks)
  requiresTransportInSettlement: boolean;
  requiresTransportOutSettlement: boolean;
}
