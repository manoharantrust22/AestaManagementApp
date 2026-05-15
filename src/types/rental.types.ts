/**
 * Rental Management Types
 * Type definitions for the Rental Management System
 */

// ============================================
// ENUMS AND CONSTANTS
// ============================================

export type RentalType = "equipment" | "scaffolding" | "shuttering" | "other";

export type RentalSourceType = "store" | "contractor";

export type RentalRateType = "hourly" | "daily";

export type RentalOrderStatus =
  | "pending"
  | "approved"
  | "draft"
  | "confirmed"
  | "active"
  | "partially_returned"
  | "completed"
  | "cancelled";

export type RentalItemStatus =
  | "pending"
  | "active"
  | "partially_returned"
  | "returned"
  | "damaged";

export type ReturnCondition = "good" | "damaged" | "lost";

export type TransportHandler = "vendor" | "company" | "laborer";

export type RentalPriceSource = "rental" | "quotation" | "manual";

export type RentalSettlementPartyType =
  | "vendor"
  | "transport"
  | "transport_inbound"
  | "transport_outbound"
  | "loading_unloading";

export const RENTAL_SETTLEMENT_PARTY_LABELS: Record<RentalSettlementPartyType, string> = {
  vendor: "Equipment Vendor",
  transport: "Transport",
  transport_inbound: "Inbound Transport",
  transport_outbound: "Outbound / Return Transport",
  loading_unloading: "Loading / Unloading",
};

// Labels for display
export const RENTAL_TYPE_LABELS: Record<RentalType, string> = {
  equipment: "Equipment/Machines",
  scaffolding: "Scaffolding",
  shuttering: "Shuttering",
  other: "Other",
};

export const RENTAL_ORDER_STATUS_LABELS: Record<RentalOrderStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  draft: "Draft",
  confirmed: "Confirmed",
  active: "Active",
  partially_returned: "Partially Returned",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const RENTAL_ORDER_STATUS_COLORS: Record<
  RentalOrderStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "secondary",
  approved: "outline",
  draft: "secondary",
  confirmed: "outline",
  active: "default",
  partially_returned: "outline",
  completed: "default",
  cancelled: "destructive",
};

export const RENTAL_ITEM_STATUS_LABELS: Record<RentalItemStatus, string> = {
  pending: "Pending",
  active: "Active",
  partially_returned: "Partially Returned",
  returned: "Returned",
  damaged: "Damaged",
};

export const RETURN_CONDITION_LABELS: Record<ReturnCondition, string> = {
  good: "Good",
  damaged: "Damaged",
  lost: "Lost",
};

export const TRANSPORT_HANDLER_LABELS: Record<TransportHandler, string> = {
  vendor: "Vendor",
  company: "Company",
  laborer: "Laborer",
};

export const RENTAL_SOURCE_TYPE_LABELS: Record<RentalSourceType, string> = {
  store: "Store",
  contractor: "Contractor",
};

export const RENTAL_RATE_TYPE_LABELS: Record<RentalRateType, string> = {
  hourly: "Hourly",
  daily: "Daily",
};

// ============================================
// BASE TYPES
// ============================================

export interface RentalItemCategory {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  parent_id: string | null;
  display_order: number;
  icon: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RentalItem {
  id: string;
  name: string;
  code: string | null;
  local_name: string | null;
  category_id: string | null;
  description: string | null;
  rental_type: RentalType;
  source_type: RentalSourceType;
  rate_type: RentalRateType;
  unit: string;
  specifications: Record<string, unknown> | null;
  default_daily_rate: number | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface RentalStoreInventory {
  id: string;
  vendor_id: string;
  rental_item_id: string;
  daily_rate: number;
  weekly_rate: number | null;
  monthly_rate: number | null;
  transport_cost: number | null;
  loading_cost: number | null;
  unloading_cost: number | null;
  min_rental_days: number;
  long_term_discount_percentage: number;
  long_term_threshold_days: number;
  notes: string | null;
  last_price_update: string | null;
  created_at: string;
  updated_at: string;
  size_rates?: SizeRates | null;   // null = single rate (use daily_rate for all sizes)
}

// Per-size daily rates map. Key = size_label, value = rate per day.
export type SizeRates = Record<string, number>;

export interface RentalItemSize {
  id: string;
  rental_item_id: string;
  size_label: string;       // e.g. "6×1½"
  display_order: number;
  is_active: boolean;
  created_at: string;
  daily_rate: number | null;            // catalog default daily rate for this variant
  default_hourly_rate: number | null;   // used when parent rate_type = 'hourly'
  image_url: string | null;             // optional; falls back to parent image_url
}

export interface RentalItemSizeFormData {
  rental_item_id: string;
  size_label: string;
  display_order?: number;
  daily_rate?: number | null;
  default_hourly_rate?: number | null;
  image_url?: string | null;
}

export interface RentalOrder {
  id: string;
  rental_order_number: string;
  site_id: string;
  vendor_id: string;
  parent_order_id: string | null;
  order_date: string;
  start_date: string;
  expected_return_date: string | null;
  actual_return_date: string | null;
  status: RentalOrderStatus;
  estimated_total: number;
  actual_total: number | null;

  // Transport outward
  transport_cost_outward: number;
  loading_cost_outward: number;
  unloading_cost_outward: number;
  outward_by: TransportHandler | null;

  // Transport return
  transport_cost_return: number;
  loading_cost_return: number;
  unloading_cost_return: number;
  return_by: TransportHandler | null;

  // Receipts
  vendor_slip_url: string | null;
  return_receipt_url: string | null;

  // Notes
  notes: string | null;
  internal_notes: string | null;

  // Discount
  negotiated_discount_percentage: number;
  negotiated_discount_amount: number;

  // Approval/Cancellation
  approved_by: string | null;
  approved_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;

  // Audit
  created_at: string;
  updated_at: string;
  created_by: string | null;
  exclude_start_date: boolean;
}

export interface RentalOrderItem {
  id: string;
  rental_order_id: string;
  rental_item_id: string;
  quantity: number;
  daily_rate_default: number;
  daily_rate_actual: number;
  rate_type: RentalRateType;
  hours_used: number | null;
  item_start_date: string | null;
  item_expected_return_date: string | null;
  quantity_returned: number;
  quantity_outstanding: number;
  status: RentalItemStatus;
  specifications: string | null;
  notes: string | null;
  rental_item_size_id: string | null;
  size_label_snapshot: string | null;
  created_at: string;
  updated_at: string;
}

export interface RentalReturn {
  id: string;
  rental_order_id: string;
  rental_order_item_id: string;
  return_date: string;
  quantity_returned: number;
  condition: ReturnCondition;
  damage_description: string | null;
  damage_cost: number;
  receipt_url: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

export interface RentalAdvance {
  id: string;
  rental_order_id: string;
  advance_date: string;
  amount: number;
  payment_mode: string | null;
  payment_channel: string | null;
  payer_source: string | null;
  payer_name: string | null;
  proof_url: string | null;
  engineer_transaction_id: string | null;
  settlement_group_id: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

export interface RentalSettlement {
  id: string;
  rental_order_id: string;
  party_type: RentalSettlementPartyType;
  party_name: string | null;
  settlement_date: string;
  settlement_reference: string | null;
  total_rental_amount: number;
  total_transport_amount: number;
  total_damage_amount: number;
  negotiated_final_amount: number | null;
  total_advance_paid: number;
  balance_amount: number;
  payment_mode: string | null;
  payment_channel: string | null;
  payer_source: string | null;
  payer_name: string | null;
  final_receipt_url: string | null;
  vendor_bill_url: string | null;
  upi_screenshot_url: string | null;
  subcontract_id: string | null;
  engineer_transaction_id: string | null;
  settlement_group_id: string | null;
  notes: string | null;
  settled_by: string | null;
  settled_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface RentalPriceHistory {
  id: string;
  vendor_id: string;
  rental_item_id: string;
  daily_rate: number;
  recorded_date: string;
  source: RentalPriceSource;
  source_reference: string | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
}

// ============================================
// EXTENDED TYPES WITH RELATIONSHIPS
// ============================================

export interface RentalItemCategoryWithChildren extends RentalItemCategory {
  children?: RentalItemCategory[];
}

export interface RentalItemWithDetails extends RentalItem {
  category?: RentalItemCategory | null;
  sizes?: RentalItemSize[];
  vendor_count?: number;
  lowest_rate?: number | null;
}

export interface RentalStoreInventoryWithDetails extends RentalStoreInventory {
  vendor?: {
    id: string;
    name: string;
    phone: string | null;
    shop_name: string | null;
  };
  rental_item?: RentalItem;
}

export interface RentalOrderWithDetails extends RentalOrder {
  vendor?: {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
    shop_name: string | null;
  };
  site?: {
    id: string;
    name: string;
  };
  items?: RentalOrderItemWithDetails[];
  advances?: RentalAdvance[];
  returns?: RentalReturn[];
  settlements?: RentalSettlement[];
  // Calculated fields
  accrued_rental_cost?: number;
  total_advance_paid?: number;
  days_since_start?: number;
  is_overdue?: boolean;
}

export interface RentalOrderItemWithDetails extends RentalOrderItem {
  rental_item?: RentalItem;
  returns?: RentalReturn[];
  // Calculated fields
  accrued_cost?: number;
  days_rented?: number;
}

// ============================================
// FORM DATA TYPES
// ============================================

export interface RentalItemFormData {
  name: string;
  code?: string;
  local_name?: string;
  category_id?: string;
  description?: string;
  rental_type: RentalType;
  source_type: RentalSourceType;
  rate_type: RentalRateType;
  unit: string;
  specifications?: Record<string, unknown>;
  default_daily_rate?: number;
  image_url?: string;
}

export interface RentalStoreInventoryFormData {
  vendor_id: string;
  rental_item_id: string;
  daily_rate: number;
  weekly_rate?: number;
  monthly_rate?: number;
  transport_cost?: number;
  loading_cost?: number;
  unloading_cost?: number;
  min_rental_days?: number;
  long_term_discount_percentage?: number;
  long_term_threshold_days?: number;
  notes?: string;
}

export interface RentalOrderFormData {
  site_id: string;
  vendor_id: string;
  start_date: string;
  expected_return_date?: string;
  transport_cost_outward?: number;
  loading_cost_outward?: number;
  unloading_cost_outward?: number;
  outward_by?: TransportHandler;
  vendor_slip_url?: string;
  notes?: string;
  negotiated_discount_percentage?: number;
  exclude_start_date?: boolean;
  items: RentalOrderItemFormData[];
}

export interface RentalOrderItemFormData {
  rental_item_id: string;
  quantity: number;
  daily_rate_default: number;
  daily_rate_actual: number;
  rate_type: RentalRateType;
  hours_used?: number;
  item_start_date?: string;
  item_expected_return_date?: string;
  specifications?: string;
  notes?: string;
  rental_item_size_id?: string | null;
  size_label_snapshot?: string | null;
}

export interface RentalReturnFormData {
  rental_order_id: string;
  rental_order_item_id: string;
  return_date: string;
  quantity_returned: number;
  condition: ReturnCondition;
  damage_description?: string;
  damage_cost?: number;
  receipt_url?: string;
  notes?: string;
}

export interface RentalAdvanceFormData {
  rental_order_id: string;
  advance_date: string;
  amount: number;
  payment_mode: string;
  payment_channel: string;
  payer_source?: string;
  payer_name?: string;
  proof_url?: string;
  notes?: string;
  subcontract_id?: string;
}

export interface RentalSettlementFormData {
  rental_order_id: string;
  party_type: RentalSettlementPartyType;
  party_name?: string | null;
  settlement_date: string;
  total_rental_amount: number;
  total_transport_amount: number;
  total_damage_amount: number;
  negotiated_final_amount?: number;
  total_advance_paid: number;
  balance_amount: number;
  payment_mode: string;
  payment_channel: string;
  payer_source?: string;
  payer_name?: string;
  final_receipt_url?: string;
  vendor_bill_url?: string;
  upi_screenshot_url?: string;
  subcontract_id?: string;
  notes?: string;
  engineer_transaction_id?: string | null;
  settlement_reference?: string | null;
}

// ============================================
// CALCULATION TYPES
// ============================================

export interface RentalCostCalculation {
  orderId: string;
  startDate: string;
  currentDate: string;
  expectedReturnDate: string | null;
  actualReturnDate: string | null;
  isCompleted: boolean;

  // Days calculation
  daysElapsed: number;
  expectedTotalDays: number;

  // Cost breakdown
  itemsCost: RentalItemCostBreakdown[];
  subtotal: number;
  discountAmount: number;
  transportCostOutward: number;
  transportCostReturn: number;
  totalTransportCost: number;
  damagesCost: number;

  // Totals
  grossTotal: number;
  advancesPaid: number;
  balanceDue: number;

  // Status
  isOverdue: boolean;
  daysOverdue: number;
}

export interface RentalItemCostBreakdown {
  itemId: string;
  itemName: string;
  quantity: number;
  quantityReturned: number;
  quantityOutstanding: number;
  dailyRate: number;
  rateType: RentalRateType;
  daysRented: number;
  hoursUsed: number | null;
  subtotal: number;
}

// ============================================
// FILTER/QUERY TYPES
// ============================================

export interface RentalOrderFilterState {
  siteId?: string;
  vendorId?: string;
  status?: RentalOrderStatus | "all";
  rentalType?: RentalType | "all";
  dateFrom?: string;
  dateTo?: string;
  showOverdueOnly?: boolean;
}

export interface RentalPriceComparisonResult {
  rentalItemId: string;
  rentalItemName: string;
  vendors: RentalVendorPrice[];
}

export interface RentalVendorPrice {
  vendorId: string;
  vendorName: string;
  shopName: string | null;
  dailyRate: number;
  weeklyRate: number | null;
  monthlyRate: number | null;
  transportCost: number;
  rating: number | null;
  lastRentalDate: string | null;
}

// ============================================
// SUMMARY/DASHBOARD TYPES
// ============================================

export interface RentalSummary {
  ongoingCount: number;
  overdueCount: number;
  totalAccruedCost: number;
  totalAdvancesPaid: number;
  totalDue: number;
  // Completed rental stats
  completedCount: number;
  totalSettledAmount: number;
  totalOutstandingBalance: number;
}

export interface RentalDashboardStats extends RentalSummary {
  recentOrders: RentalOrderWithDetails[];
  overdueOrders: RentalOrderWithDetails[];
}

// ─── Estimate Basket ───────────────────────────────────────────────────────

export interface EstimateBasketItem {
  id: string;                    // unique key for this basket entry
  rental_item_id: string;
  rental_item_name: string;
  size_label: string | null;     // null for items with no size variants
  quantity: number;
  days: number;
}

export interface VendorEstimate {
  vendor_id: string;
  vendor_name: string;
  total_rental_cost: number;     // sum across all basket items
  line_items: {
    rental_item_id: string;
    size_label: string | null;
    qty: number;
    days: number;
    daily_rate: number;
    line_total: number;
  }[];
  is_cheapest: boolean;
}

// ============================================
// HISTORICAL RENTAL RECORD TYPES
// ============================================

export interface HistoricalRentalItemFormData {
  item_name: string;
  rental_item_id?: string | null;
  quantity: number;
  daily_rate: number;
  days: number;
}

export interface HistoricalTransportFormData {
  amount: number;
  paid_to: "vendor" | "driver";
  driver_name?: string;
}

export interface HistoricalAdvanceFormData {
  advance_date: string;
  amount: number;
  payer_source: string;
  payment_mode: string;
}

export interface HistoricalSettlementFormData {
  final_amount: number;
  settlement_date: string;
  payer_source: string;
  payment_mode: string;
}

export interface HistoricalRentalFormData {
  site_id: string;
  vendor_id: string;
  bill_ref?: string;
  calculation_sheet_url?: string;
  start_date: string;
  end_date: string;
  exclude_start_date?: boolean;
  items: HistoricalRentalItemFormData[];
  rental_total: number;
  inbound_transport?: HistoricalTransportFormData;
  outbound_transport?: HistoricalTransportFormData;
  advances: HistoricalAdvanceFormData[];
  settlement?: HistoricalSettlementFormData;              // vendor settlement
  inbound_driver_settlement?: HistoricalSettlementFormData;   // only when inbound paid_to = "driver"
  outbound_driver_settlement?: HistoricalSettlementFormData;  // only when outbound paid_to = "driver"
  status?: "draft" | "completed";
}
