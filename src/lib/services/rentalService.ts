/**
 * Rental Service
 * Business logic for rental operations including advances and settlements
 */

import { SupabaseClient } from "@supabase/supabase-js";
import dayjs from "dayjs";
import type { PayerSource } from "@/types/settlement.types";
import type { BatchAllocation } from "@/types/wallet.types";
import type {
  RentalCostCalculation,
  RentalItemCostBreakdown,
  RentalOrderWithDetails,
  RentalSummary,
} from "@/types/rental.types";

// ============================================
// Types
// ============================================

export interface RentalAdvanceConfig {
  rentalOrderId: string;
  siteId: string;
  amount: number;
  advanceDate: string;
  paymentMode: string;
  paymentChannel: "direct" | "engineer_wallet";
  payerSource?: PayerSource;
  customPayerName?: string;
  engineerId?: string;
  proofUrl?: string;
  notes?: string;
  userId: string;
  userName: string;
  batchAllocations?: BatchAllocation[];
}

export interface RentalAdvanceResult {
  success: boolean;
  advanceId?: string;
  settlementGroupId?: string;
  error?: string;
}

export interface RentalSettlementConfig {
  rentalOrderId: string;
  siteId: string;
  settlementDate: string;
  totalRentalAmount: number;
  totalTransportAmount: number;
  totalDamageAmount: number;
  negotiatedFinalAmount?: number;
  totalAdvancePaid: number;
  balanceAmount: number;
  paymentMode: string;
  paymentChannel: "direct" | "engineer_wallet";
  payerSource?: PayerSource;
  customPayerName?: string;
  engineerId?: string;
  proofUrl?: string;
  vendorBillUrl?: string;
  upiScreenshotUrl?: string;
  subcontractId?: string;
  notes?: string;
  userId: string;
  userName: string;
  batchAllocations?: BatchAllocation[];
}

export interface RentalSettlementResult {
  success: boolean;
  settlementId?: string;
  settlementReference?: string;
  settlementGroupId?: string;
  error?: string;
}

// ============================================
// Advance Payment Processing
// ============================================

/**
 * Process rental advance payment
 * Handles both direct and engineer wallet payments
 */
export async function processRentalAdvance(
  supabase: SupabaseClient,
  config: RentalAdvanceConfig
): Promise<RentalAdvanceResult> {
  try {
    let engineerTransactionId: string | null = null;
    let settlementGroupId: string | null = null;

    // If via engineer wallet, record spending
    if (config.paymentChannel === "engineer_wallet" && config.engineerId) {
      if (!config.batchAllocations || config.batchAllocations.length === 0) {
        throw new Error("Batch allocation required for engineer wallet payment.");
      }

      // Import dynamically to avoid circular deps
      const { recordWalletSpending } = await import("./walletService");

      const spendingResult = await recordWalletSpending(supabase, {
        engineerId: config.engineerId,
        amount: config.amount,
        siteId: config.siteId,
        description: `Rental advance`,
        recipientType: "vendor",
        paymentMode: config.paymentMode as "cash" | "upi" | "bank_transfer",
        moneySource: "wallet",
        batchAllocations: config.batchAllocations,
        proofUrl: config.proofUrl,
        notes: config.notes,
        transactionDate: config.advanceDate,
        userName: config.userName,
        userId: config.userId,
      });

      if (!spendingResult.success) {
        throw new Error(spendingResult.error || "Failed to record wallet spending");
      }

      engineerTransactionId = spendingResult.transactionId || null;
    }

    // Create settlement group for tracking (optional, for expense reporting)
    if (config.paymentChannel === "direct" || engineerTransactionId) {
      const settlementRef = `RADV-${dayjs().format("YYMMDD")}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

      const { data: groupData, error: groupError } = await supabase
        .from("settlement_groups")
        .insert({
          settlement_reference: settlementRef,
          site_id: config.siteId,
          settlement_date: config.advanceDate,
          total_amount: config.amount,
          laborer_count: 0,
          payment_channel: config.paymentChannel,
          payment_mode: config.paymentMode,
          payer_source: config.payerSource || null,
          payer_name: config.payerSource === "custom" ? config.customPayerName : null,
          proof_url: config.proofUrl || null,
          notes: `Rental advance: ${config.notes || ""}`,
          engineer_transaction_id: engineerTransactionId,
          created_by: config.userId,
          created_by_name: config.userName,
          settlement_type: "rental_advance",
        })
        .select()
        .single();

      if (!groupError && groupData) {
        settlementGroupId = groupData.id;
      }
    }

    // Create advance record
    const { data: advanceData, error: advanceError } = await supabase
      .from("rental_advances")
      .insert({
        rental_order_id: config.rentalOrderId,
        advance_date: config.advanceDate,
        amount: config.amount,
        payment_mode: config.paymentMode,
        payment_channel: config.paymentChannel,
        payer_source: config.payerSource || null,
        payer_name: config.payerSource === "custom" ? config.customPayerName : null,
        proof_url: config.proofUrl,
        engineer_transaction_id: engineerTransactionId,
        settlement_group_id: settlementGroupId,
        notes: config.notes,
        created_by: config.userId,
      })
      .select()
      .single();

    if (advanceError) throw advanceError;

    return {
      success: true,
      advanceId: advanceData.id,
      settlementGroupId: settlementGroupId || undefined,
    };
  } catch (err: unknown) {
    const error = err as Error;
    console.error("Rental advance error:", error);
    return {
      success: false,
      error: error.message || "Failed to process rental advance",
    };
  }
}

// ============================================
// Settlement Processing
// ============================================

/**
 * Process final rental settlement
 * Handles both direct and engineer wallet payments
 */
export async function processRentalSettlement(
  supabase: SupabaseClient,
  config: RentalSettlementConfig
): Promise<RentalSettlementResult> {
  try {
    let engineerTransactionId: string | null = null;
    let settlementGroupId: string | null = null;
    let settlementReference: string | null = null;

    // Only process payment if there's a balance to pay
    if (config.balanceAmount > 0) {
      // If via engineer wallet, record spending
      if (config.paymentChannel === "engineer_wallet" && config.engineerId) {
        if (!config.batchAllocations || config.batchAllocations.length === 0) {
          throw new Error("Batch allocation required for engineer wallet payment.");
        }

        const { recordWalletSpending } = await import("./walletService");

        const spendingResult = await recordWalletSpending(supabase, {
          engineerId: config.engineerId,
          amount: config.balanceAmount,
          siteId: config.siteId,
          description: `Rental settlement`,
          recipientType: "vendor",
          paymentMode: config.paymentMode as "cash" | "upi" | "bank_transfer",
          moneySource: "wallet",
          batchAllocations: config.batchAllocations,
          proofUrl: config.proofUrl,
          notes: config.notes,
          transactionDate: config.settlementDate,
          userName: config.userName,
          userId: config.userId,
        });

        if (!spendingResult.success) {
          throw new Error(spendingResult.error || "Failed to record wallet spending");
        }

        engineerTransactionId = spendingResult.transactionId || null;
      }

      // Generate settlement reference
      const { data: refData } = await supabase.rpc(
        "generate_rental_settlement_reference",
        { p_site_id: config.siteId }
      );
      settlementReference = refData || `RSET-${dayjs().format("YYMMDD")}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

      // Create settlement group
      const { data: groupData, error: groupError } = await supabase
        .from("settlement_groups")
        .insert({
          settlement_reference: settlementReference,
          site_id: config.siteId,
          settlement_date: config.settlementDate,
          total_amount: config.balanceAmount,
          laborer_count: 0,
          payment_channel: config.paymentChannel,
          payment_mode: config.paymentMode,
          payer_source: config.payerSource || null,
          payer_name: config.payerSource === "custom" ? config.customPayerName : null,
          proof_url: config.proofUrl || null,
          notes: `Rental settlement: ${config.notes || ""}`,
          engineer_transaction_id: engineerTransactionId,
          created_by: config.userId,
          created_by_name: config.userName,
          settlement_type: "rental_settlement",
        })
        .select()
        .single();

      if (!groupError && groupData) {
        settlementGroupId = groupData.id;
      }
    }

    // Create settlement record
    const { data: settlementData, error: settlementError } = await supabase
      .from("rental_settlements")
      .insert({
        rental_order_id: config.rentalOrderId,
        settlement_date: config.settlementDate,
        settlement_reference: settlementReference,
        total_rental_amount: config.totalRentalAmount,
        total_transport_amount: config.totalTransportAmount,
        total_damage_amount: config.totalDamageAmount,
        negotiated_final_amount: config.negotiatedFinalAmount,
        total_advance_paid: config.totalAdvancePaid,
        balance_amount: config.balanceAmount,
        payment_mode: config.paymentMode,
        payment_channel: config.paymentChannel,
        payer_source: config.payerSource || null,
        payer_name: config.payerSource === "custom" ? config.customPayerName : null,
        final_receipt_url: config.proofUrl,
        vendor_bill_url: config.vendorBillUrl || null,
        upi_screenshot_url: config.upiScreenshotUrl || null,
        subcontract_id: config.subcontractId || null,
        engineer_transaction_id: engineerTransactionId,
        settlement_group_id: settlementGroupId,
        notes: config.notes,
        settled_by: config.userId,
        settled_by_name: config.userName,
      })
      .select()
      .single();

    if (settlementError) throw settlementError;

    // Update rental order status
    await supabase
      .from("rental_orders")
      .update({
        status: "completed",
        actual_total:
          config.negotiatedFinalAmount ||
          config.totalRentalAmount + config.totalTransportAmount + config.totalDamageAmount,
        actual_return_date: config.settlementDate,
      })
      .eq("id", config.rentalOrderId);

    return {
      success: true,
      settlementId: settlementData.id,
      settlementReference: settlementReference || undefined,
      settlementGroupId: settlementGroupId || undefined,
    };
  } catch (err: unknown) {
    const error = err as Error;
    console.error("Rental settlement error:", error);
    return {
      success: false,
      error: error.message || "Failed to process rental settlement",
    };
  }
}

// ============================================
// Cost Calculation
// ============================================

/**
 * Calculate rental cost from order data
 * Pure function - no database calls
 */
export function calculateRentalCost(
  order: RentalOrderWithDetails,
  asOfDate?: Date
): RentalCostCalculation {
  const now = asOfDate || new Date();
  const startDate = new Date(order.start_date);
  const expectedReturnDate = order.expected_return_date
    ? new Date(order.expected_return_date)
    : null;

  const daysElapsed = Math.max(
    1,
    Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  );
  const expectedTotalDays = expectedReturnDate
    ? Math.ceil(
        (expectedReturnDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      )
    : daysElapsed;

  const itemsCost: RentalItemCostBreakdown[] = (order.items || []).map((item) => {
    const itemStartDate = item.item_start_date
      ? new Date(item.item_start_date)
      : startDate;
    const daysRented = Math.max(
      1,
      Math.ceil((now.getTime() - itemStartDate.getTime()) / (1000 * 60 * 60 * 24))
    );

    const rateType = item.rate_type || "daily";
    const hoursUsed = item.hours_used || null;

    // Calculate subtotal based on rate type
    let subtotal: number;
    if (rateType === "hourly" && hoursUsed) {
      // Hourly items: qty × rate × hours
      subtotal = item.quantity_outstanding * item.daily_rate_actual * hoursUsed;
    } else {
      // Daily items: qty × rate × days
      subtotal = item.quantity_outstanding * item.daily_rate_actual * daysRented;
    }

    return {
      itemId: item.id,
      itemName: item.rental_item?.name || "Unknown",
      size_label_snapshot: item.size_label_snapshot ?? null,
      quantity: item.quantity,
      quantityReturned: item.quantity_returned,
      quantityOutstanding: item.quantity_outstanding,
      dailyRate: item.daily_rate_actual,
      rateType,
      daysRented,
      hoursUsed,
      subtotal,
    };
  });

  const subtotal = itemsCost.reduce((sum, item) => sum + item.subtotal, 0);
  const discountAmount = (subtotal * order.negotiated_discount_percentage) / 100;

  const transportCostOutward =
    order.transport_cost_outward +
    order.loading_cost_outward +
    order.unloading_cost_outward;
  const transportCostReturn =
    order.transport_cost_return +
    order.loading_cost_return +
    order.unloading_cost_return;
  const totalTransportCost = transportCostOutward + transportCostReturn;

  const damagesCost = (order.returns || []).reduce(
    (sum: number, ret: any) => sum + (ret.damage_cost || 0),
    0
  );

  const grossTotal = subtotal - discountAmount + totalTransportCost + damagesCost;
  const advancesPaid = (order.advances || []).reduce(
    (sum: number, adv: any) => sum + adv.amount,
    0
  );
  const balanceDue = grossTotal - advancesPaid;

  const isOverdue = expectedReturnDate ? now > expectedReturnDate : false;
  const daysOverdue =
    isOverdue && expectedReturnDate
      ? Math.ceil(
          (now.getTime() - expectedReturnDate.getTime()) / (1000 * 60 * 60 * 24)
        )
      : 0;

  const isCompleted = order.status === "completed";
  const actualReturnDate = (order as any).actual_return_date ?? null;

  return {
    orderId: order.id,
    startDate: order.start_date,
    currentDate: isCompleted && actualReturnDate
      ? actualReturnDate
      : now.toISOString().split("T")[0],
    expectedReturnDate: order.expected_return_date,
    actualReturnDate,
    isCompleted,
    daysElapsed,
    expectedTotalDays,
    itemsCost,
    subtotal,
    discountAmount,
    transportCostOutward,
    transportCostReturn,
    totalTransportCost,
    damagesCost,
    grossTotal,
    advancesPaid,
    balanceDue,
    isOverdue: isCompleted ? false : isOverdue,
    daysOverdue: isCompleted ? 0 : daysOverdue,
  };
}

// ============================================
// Summary/Dashboard Data
// ============================================

/**
 * Get rental summary for a site
 */
export async function getRentalSummary(
  supabase: SupabaseClient,
  siteId: string
): Promise<RentalSummary> {
  const today = dayjs().format("YYYY-MM-DD");

  // Fetch ongoing orders
  const { data: ongoingOrders } = await supabase
    .from("rental_orders")
    .select(
      `
      id,
      status,
      start_date,
      expected_return_date,
      items:rental_order_items(quantity_outstanding, daily_rate_actual, item_start_date),
      advances:rental_advances(amount)
    `
    )
    .eq("site_id", siteId)
    .in("status", ["confirmed", "active", "partially_returned"]);

  // Fetch completed orders with settlements
  const { data: completedOrders } = await supabase
    .from("rental_orders")
    .select(
      `
      id,
      status,
      actual_total,
      settlement:rental_settlements(
        negotiated_final_amount,
        total_rental_amount,
        total_transport_amount,
        total_damage_amount,
        total_advance_paid,
        balance_amount
      )
    `
    )
    .eq("site_id", siteId)
    .eq("status", "completed");

  let ongoingCount = 0;
  let overdueCount = 0;
  let totalAccruedCost = 0;
  let totalAdvancesPaid = 0;

  const now = new Date();

  for (const order of ongoingOrders || []) {
    ongoingCount++;

    if (order.expected_return_date && order.expected_return_date < today) {
      overdueCount++;
    }

    // Sum advances
    totalAdvancesPaid += (order.advances || []).reduce(
      (sum: number, adv: any) => sum + (adv.amount || 0),
      0
    );

    // Calculate accrued cost
    const startDate = new Date(order.start_date);
    const daysSinceStart = Math.max(
      1,
      Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    );

    totalAccruedCost += (order.items || []).reduce((sum: number, item: any) => {
      const itemDays = item.item_start_date
        ? Math.max(
            1,
            Math.ceil(
              (now.getTime() - new Date(item.item_start_date).getTime()) /
                (1000 * 60 * 60 * 24)
            )
          )
        : daysSinceStart;
      return sum + (item.quantity_outstanding || 0) * (item.daily_rate_actual || 0) * itemDays;
    }, 0);
  }

  // Calculate completed stats
  let completedCount = 0;
  let totalSettledAmount = 0;
  let totalOutstandingBalance = 0;

  for (const order of completedOrders || []) {
    completedCount++;
    const settlement = order.settlement as any;
    if (settlement) {
      const finalAmount = settlement.negotiated_final_amount ||
        (settlement.total_rental_amount + settlement.total_transport_amount + settlement.total_damage_amount);
      totalSettledAmount += finalAmount;
      totalOutstandingBalance += Math.max(0, settlement.balance_amount || 0);
    } else {
      totalSettledAmount += order.actual_total || 0;
    }
  }

  return {
    ongoingCount,
    overdueCount,
    totalAccruedCost,
    totalAdvancesPaid,
    totalDue: totalAccruedCost - totalAdvancesPaid,
    completedCount,
    totalSettledAmount,
    totalOutstandingBalance,
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Format currency for display
 */
export function formatRentalCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Calculate days between two dates
 */
export function calculateDaysBetween(
  startDate: string | Date,
  endDate: string | Date
): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
}

/**
 * Check if a rental order is overdue
 */
export function isRentalOverdue(
  expectedReturnDate: string | null,
  status: string
): boolean {
  if (!expectedReturnDate || status === "completed" || status === "cancelled") {
    return false;
  }
  return new Date() > new Date(expectedReturnDate);
}

/**
 * Get status color for display
 */
export function getRentalStatusColor(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  const colors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    draft: "secondary",
    confirmed: "outline",
    active: "default",
    partially_returned: "outline",
    completed: "default",
    cancelled: "destructive",
  };
  return colors[status] || "default";
}
