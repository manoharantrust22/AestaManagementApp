import { SupabaseClient } from "@supabase/supabase-js";
import dayjs from "dayjs";
import { createSalaryExpense } from "./notificationService";
import type {
  PaymentMode,
  PaymentChannel,
  ContractPaymentType,
  ContractPaymentConfig,
  PaymentDetails,
  PaymentWeekAllocation,
} from "@/types/payment.types";
import type { PayerSource, SettlementRecord } from "@/types/settlement.types";
import type { BatchAllocation } from "@/types/wallet.types";
import { recordWalletSpending } from "./walletService";

export interface SettlementResult {
  success: boolean;
  expenseId?: string;
  engineerTransactionId?: string;
  settlementReference?: string;
  settlementGroupId?: string;
  error?: string;
}

export interface SettlementConfig {
  siteId: string;
  records: SettlementRecord[];
  totalAmount: number;
  paymentMode: PaymentMode;
  paymentChannel: PaymentChannel;
  payerSource: PayerSource;
  customPayerName?: string;
  engineerId?: string;
  engineerReference?: string;
  proofUrl?: string;
  notes?: string;
  subcontractId?: string;
  userId: string;
  userName: string;
  // For engineer wallet spending - which batches to use
  batchAllocations?: BatchAllocation[];
}

// =============================================================================
// Retry Logic and Error Handling
// =============================================================================

/**
 * Retry wrapper for settlement group creation with exponential backoff
 * Handles transient errors and duplicate key issues
 */
async function createSettlementWithRetry(
  supabase: SupabaseClient,
  params: any,
  maxRetries: number = 2
): Promise<{ data: any; error: any }> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { data, error } = await supabase.rpc('create_settlement_group', params);

      // Success - return immediately
      if (!error) {
        if (attempt > 0) {
          console.log(`[Settlement] Succeeded on attempt ${attempt + 1}/${maxRetries}`);
        }
        return { data, error: null };
      }

      // Check if it's a duplicate key error that might resolve on retry
      const isDuplicateKey = error.message?.includes('duplicate key') ||
                             error.message?.includes('unique_violation');

      // If duplicate key and not last attempt, wait and retry
      if (isDuplicateKey && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 100; // 100ms, 200ms, 400ms, etc.
        console.warn(
          `[Settlement] Duplicate key on attempt ${attempt + 1}/${maxRetries}, retrying in ${delay}ms...`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Last attempt or non-retriable error - return error
      return { data: null, error };

    } catch (err: any) {
      // Unexpected exception
      if (attempt === maxRetries - 1) {
        // Last attempt - throw the error
        throw err;
      }

      // Not last attempt - log and retry
      const delay = Math.pow(2, attempt) * 100;
      console.warn(
        `[Settlement] Exception on attempt ${attempt + 1}/${maxRetries}, retrying in ${delay}ms:`,
        err.message
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Should never reach here
  return { data: null, error: new Error('Max retries exceeded') };
}

/**
 * Insert a labor_payment with retry on unique constraint violation (23505).
 * The generate_payment_reference RPC and INSERT run in separate transactions,
 * so concurrent calls can generate the same reference. This retries with a
 * fresh reference on collision.
 */
async function insertLaborPaymentWithRetry(
  supabase: SupabaseClient,
  payload: Record<string, any>,
  siteId: string,
  maxRetries = 3
): Promise<{ data: any; error: any }> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let paymentReference: string;

    if (attempt === 0) {
      // First attempt: try RPC-generated sequential reference
      const { data: payRefData, error: payRefError } = await supabase.rpc(
        "generate_payment_reference",
        { p_site_id: siteId }
      );
      paymentReference = payRefError
        ? `PAY-${dayjs().format("YYMMDD")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
        : (payRefData as string);
    } else {
      // Retry: use UUID-based reference to guarantee uniqueness
      paymentReference = `PAY-${dayjs().format("YYMMDD")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    }

    const { data, error } = await (supabase.from("labor_payments") as any)
      .insert({ ...payload, payment_reference: paymentReference })
      .select()
      .single();

    if (!error) return { data, error: null };

    if (error.code === "23505" && attempt < maxRetries - 1) {
      console.warn(`[Settlement] Payment reference collision (attempt ${attempt + 1}), retrying with UUID...`);
      continue;
    }

    return { data: null, error };
  }
  return { data: null, error: new Error("Failed to insert labor_payment after max retries") };
}

/**
 * Generate idempotency key for a settlement
 * Used to prevent duplicate submissions within a short time window
 */
function getSettlementIdempotencyKey(config: SettlementConfig): string {
  // Sort record IDs for consistent key generation
  const recordIds = [...config.records]
    .map(r => r.sourceId)
    .sort()
    .join('_');
  return `settlement_${config.siteId}_${recordIds}`;
}

/**
 * Check if settlement was recently submitted (within last 5 seconds)
 * Prevents accidental duplicate submissions from double-clicks
 */
function checkRecentSubmission(key: string): boolean {
  try {
    const recentKey = `recent_${key}`;
    const recent = localStorage.getItem(recentKey);
    if (recent) {
      const timestamp = parseInt(recent, 10);
      const now = Date.now();
      const diff = now - timestamp;

      // If submitted within last 5 seconds, it's a duplicate
      if (diff < 5000) {
        console.warn(`[Settlement] Duplicate submission detected (${diff}ms ago)`);
        return true;
      }
    }
    return false;
  } catch (err) {
    // localStorage might be unavailable - allow submission
    console.warn('[Settlement] Could not check recent submission:', err);
    return false;
  }
}

/**
 * Mark settlement as recently submitted
 */
function markAsRecentlySubmitted(key: string): void {
  try {
    const recentKey = `recent_${key}`;
    localStorage.setItem(recentKey, Date.now().toString());

    // Clean up after 10 seconds
    setTimeout(() => {
      try {
        localStorage.removeItem(recentKey);
      } catch (err) {
        // Ignore cleanup errors
      }
    }, 10000);
  } catch (err) {
    // localStorage might be unavailable - continue anyway
    console.warn('[Settlement] Could not mark as recently submitted:', err);
  }
}

/**
 * Convert settlement error to user-friendly message
 */
function getSettlementErrorMessage(err: any): string {
  const message = err?.message || err?.toString() || 'Unknown error';

  // Duplicate key error
  if (message.includes('duplicate key') || message.includes('unique_violation')) {
    return 'A settlement with this reference already exists. Please wait a moment and try again.';
  }

  // Settlement creation failed after retries
  if (message.includes('Failed to create settlement after')) {
    return 'Unable to generate unique settlement reference after multiple attempts. Please contact support with this error.';
  }

  // Wallet-related errors
  if (message.includes('wallet') || message.includes('balance')) {
    return `Wallet operation failed: ${message}`;
  }

  // Session/auth errors
  if (message.includes('session') || message.includes('JWT') || message.includes('unauthorized')) {
    return 'Your session has expired. Please refresh the page and try again.';
  }

  // Network errors
  if (message.includes('fetch') || message.includes('network') || message.includes('timeout')) {
    return 'Network error. Please check your connection and try again.';
  }

  // Generic error with the actual message
  return `Failed to process settlement: ${message}`;
}

/**
 * Log settlement error for debugging
 */
function logSettlementError(context: string, err: any, additionalInfo?: any): void {
  console.error(`[Settlement Error - ${context}]`, {
    timestamp: new Date().toISOString(),
    error: err?.message || err,
    stack: err?.stack,
    ...additionalInfo
  });
}

// =============================================================================

/**
 * Process a settlement - the main entry point for all settlement operations.
 * This ensures consistency across all settlement paths (attendance page, salary page, etc.)
 *
 * Now creates a settlement_group as the single source of truth.
 * Expenses are derived from settlement_groups via the v_all_expenses view.
 */
export async function processSettlement(
  supabase: SupabaseClient,
  config: SettlementConfig
): Promise<SettlementResult> {
  try {
    // Check for recent duplicate submission (prevents accidental double-clicks)
    const idempotencyKey = getSettlementIdempotencyKey(config);
    if (checkRecentSubmission(idempotencyKey)) {
      throw new Error('Settlement already submitted. Please wait a moment before trying again.');
    }

    // Mark as being processed
    markAsRecentlySubmitted(idempotencyKey);

    const paymentDate = dayjs().format("YYYY-MM-DD");
    let engineerTransactionId: string | null = null;
    let settlementGroupId: string | undefined;
    let settlementReference: string | undefined;

    // Get subcontract from config OR from existing attendance records
    // This handles the case where a settlement was canceled and re-created
    let effectiveSubcontractId = config.subcontractId;
    if (!effectiveSubcontractId && config.records.length > 0) {
      effectiveSubcontractId = await getSubcontractFromAttendanceRecords(supabase, config.records) ?? undefined;
    }

    // Calculate laborer count (market records may have count field)
    const laborerCount = config.records.reduce((sum, r) => {
      if (r.sourceType === "market" && r.count) {
        return sum + r.count;
      }
      return sum + 1;
    }, 0);

    // Get the record date (use first record's date)
    const recordDate = config.records.length > 0 ? config.records[0].date : paymentDate;

    // 1. Create settlement_group FIRST using atomic function with retry logic
    const { data: groupResult, error: groupError } = await createSettlementWithRetry(
      supabase,
      {
        p_site_id: config.siteId,
        p_settlement_date: recordDate,
        p_total_amount: config.totalAmount,
        p_laborer_count: laborerCount,
        p_payment_channel: config.paymentChannel,
        p_payment_mode: config.paymentMode,
        p_payer_source: config.payerSource,
        p_payer_name: config.payerSource === "custom" || config.payerSource === "other_site_money"
          ? config.customPayerName
          : null,
        p_proof_url: config.proofUrl || null,
        p_notes: config.notes || null,
        p_subcontract_id: effectiveSubcontractId || null,
        p_engineer_transaction_id: null, // Will be updated after wallet spending
        p_created_by: config.userId,
        p_created_by_name: config.userName,
      }
    );

    if (groupError) {
      logSettlementError('processSettlement', groupError, {
        siteId: config.siteId,
        recordDate,
        amount: config.totalAmount
      });
      throw groupError;
    }

    // The RPC returns an array with one row containing id and settlement_reference
    const groupData = Array.isArray(groupResult) ? groupResult[0] : groupResult;
    if (!groupData || !groupData.id) {
      throw new Error("Failed to create settlement group - no data returned");
    }

    settlementGroupId = groupData.id;
    settlementReference = groupData.settlement_reference;

    // 2. If via engineer wallet, record spending transaction (deducts from wallet batches)
    if (config.paymentChannel === "engineer_wallet" && config.engineerId) {
      // Validate batch allocations are provided
      if (!config.batchAllocations || config.batchAllocations.length === 0) {
        throw new Error("Batch allocation required for engineer wallet settlement. Please select which wallet batches to use.");
      }

      // Use walletService.recordWalletSpending for proper batch tracking
      // Map payment mode for compatibility (net_banking -> bank_transfer)
      const walletPaymentMode = config.paymentMode === "net_banking" ? "bank_transfer" : config.paymentMode;
      const spendingResult = await recordWalletSpending(supabase, {
        engineerId: config.engineerId,
        amount: config.totalAmount,
        siteId: config.siteId,
        description: config.engineerReference || `Salary settlement ${settlementReference}`,
        recipientType: "laborer",
        paymentMode: walletPaymentMode as any,
        moneySource: "wallet",
        batchAllocations: config.batchAllocations,
        subcontractId: effectiveSubcontractId,
        proofUrl: config.proofUrl,
        notes: config.notes,
        transactionDate: paymentDate,
        userName: config.userName,
        userId: config.userId,
        settlementReference: settlementReference,
        settlementGroupId: settlementGroupId,
      });

      if (!spendingResult.success) {
        // Rollback: cancel the settlement group since wallet spending failed
        await supabase
          .from("settlement_groups")
          .update({
            is_cancelled: true,
            cancelled_at: new Date().toISOString(),
            cancelled_by: config.userName,
            cancelled_by_user_id: config.userId,
            cancellation_reason: `Wallet spending failed: ${spendingResult.error}`,
          })
          .eq("id", settlementGroupId);
        throw new Error(spendingResult.error || "Failed to record wallet spending");
      }

      engineerTransactionId = spendingResult.transactionId || null;

      // Update settlement_group with the engineer_transaction_id
      if (engineerTransactionId) {
        const { error: updateError } = await supabase
          .from("settlement_groups")
          .update({ engineer_transaction_id: engineerTransactionId })
          .eq("id", settlementGroupId);

        if (updateError) {
          console.warn("Could not update settlement_group with engineer_transaction_id:", updateError);
        }
      }
    }

    // 3. Update attendance records with settlement_group_id
    const updateData = {
      is_paid: config.paymentChannel === "direct",
      payment_date: paymentDate,
      payment_mode: config.paymentMode,
      paid_via: config.paymentChannel === "direct" ? "direct" : "engineer_wallet",
      engineer_transaction_id: engineerTransactionId,
      payment_proof_url: config.proofUrl || null,
      payment_notes: config.notes || null,
      payer_source: config.payerSource,
      payer_name: config.payerSource === "custom" ? config.customPayerName : null,
      settlement_group_id: settlementGroupId,
    };

    // Group records by type
    const dailyIds = config.records
      .filter((r) => r.sourceType === "daily")
      .map((r) => r.sourceId);
    const marketIds = config.records
      .filter((r) => r.sourceType === "market")
      .map((r) => r.sourceId);

    // Wrap attendance updates with rollback on failure to prevent orphaned settlements
    try {
      // Update daily_attendance records
      if (dailyIds.length > 0) {
        const { error: dailyError } = await supabase
          .from("daily_attendance")
          .update({
            ...updateData,
            subcontract_id: effectiveSubcontractId || null,
          })
          .in("id", dailyIds);

        if (dailyError) throw dailyError;
      }

      // Update market_laborer_attendance records
      if (marketIds.length > 0) {
        const { error: marketError } = await supabase
          .from("market_laborer_attendance")
          .update({
            ...updateData,
            subcontract_id: effectiveSubcontractId || null,
          })
          .in("id", marketIds);

        if (marketError) throw marketError;
      }

      // Verify at least one attendance record was linked (prevents orphaned settlements)
      if (dailyIds.length === 0 && marketIds.length === 0) {
        throw new Error("No attendance records to settle. Settlement requires at least one daily or market attendance record.");
      }
    } catch (attendanceError: any) {
      // Rollback: cancel the settlement group since attendance update failed
      console.error("Attendance update failed, rolling back settlement group:", attendanceError);
      await supabase
        .from("settlement_groups")
        .update({
          is_cancelled: true,
          cancelled_at: new Date().toISOString(),
          cancelled_by: config.userName,
          cancelled_by_user_id: config.userId,
          cancellation_reason: `Attendance update failed: ${attendanceError.message || 'Unknown error'}`,
        })
        .eq("id", settlementGroupId);
      throw attendanceError;
    }

    // NOTE: We no longer create salary expenses here!
    // Expenses are now derived from settlement_groups via the v_all_expenses view.
    // This ensures single source of truth and automatic sync of changes.

    return {
      success: true,
      settlementReference,
      settlementGroupId,
      engineerTransactionId: engineerTransactionId || undefined,
    };
  } catch (err: any) {
    logSettlementError('processSettlement', err, {
      siteId: config.siteId,
      totalAmount: config.totalAmount,
      recordCount: config.records.length
    });
    return {
      success: false,
      error: getSettlementErrorMessage(err),
    };
  }
}

/**
 * Process a weekly settlement for a date range
 * Now creates a settlement_group as the single source of truth.
 */
export async function processWeeklySettlement(
  supabase: SupabaseClient,
  config: {
    siteId: string;
    dateFrom: string;
    dateTo: string;
    settlementType: "all" | "daily" | "contract" | "market";
    totalAmount: number;
    paymentMode: PaymentMode;
    paymentChannel: PaymentChannel;
    payerSource: PayerSource;
    customPayerName?: string;
    engineerId?: string;
    engineerReference?: string;
    proofUrl?: string;
    notes?: string;
    subcontractId?: string;
    userId: string;
    userName: string;
    batchAllocations?: BatchAllocation[];
  }
): Promise<SettlementResult> {
  try {
    const paymentDate = dayjs().format("YYYY-MM-DD");
    let engineerTransactionId: string | null = null;
    let settlementGroupId: string | undefined;
    let settlementReference: string | undefined;

    // 1. Count records that will be settled FIRST
    let laborerCount = 0;

    if (config.settlementType === "daily" || config.settlementType === "all") {
      const { count } = await supabase
        .from("daily_attendance")
        .select("*", { count: "exact", head: true })
        .eq("site_id", config.siteId)
        .gte("date", config.dateFrom)
        .lte("date", config.dateTo)
        .eq("is_paid", false)
        .neq("laborer_type", "contract");
      laborerCount += count || 0;
    }

    if (config.settlementType === "contract" || config.settlementType === "all") {
      const { count } = await supabase
        .from("daily_attendance")
        .select("*", { count: "exact", head: true })
        .eq("site_id", config.siteId)
        .gte("date", config.dateFrom)
        .lte("date", config.dateTo)
        .eq("is_paid", false)
        .eq("laborer_type", "contract");
      laborerCount += count || 0;
    }

    if (config.settlementType === "market" || config.settlementType === "all") {
      const { data: marketData } = await supabase
        .from("market_laborer_attendance")
        .select("count")
        .eq("site_id", config.siteId)
        .gte("date", config.dateFrom)
        .lte("date", config.dateTo)
        .eq("is_paid", false);
      laborerCount += (marketData || []).reduce((sum, r) => sum + (r.count || 1), 0);
    }

    // 2. Create settlement_group using atomic function (guaranteed unique reference)
    const { data: groupResult, error: groupError } = await supabase.rpc(
      "create_settlement_group",
      {
        p_site_id: config.siteId,
        p_settlement_date: config.dateFrom,
        p_total_amount: config.totalAmount,
        p_laborer_count: laborerCount,
        p_payment_channel: config.paymentChannel,
        p_payment_mode: config.paymentMode,
        p_payer_source: config.payerSource,
        p_payer_name: config.payerSource === "custom" || config.payerSource === "other_site_money"
          ? config.customPayerName
          : null,
        p_proof_url: config.proofUrl || null,
        p_notes: config.notes ? `Weekly (${config.dateFrom} - ${config.dateTo}): ${config.notes}` : `Weekly settlement (${config.dateFrom} - ${config.dateTo})`,
        p_subcontract_id: config.subcontractId || null,
        p_engineer_transaction_id: null,
        p_created_by: config.userId,
        p_created_by_name: config.userName,
      }
    );

    if (groupError) {
      console.error("Error creating settlement_group:", groupError);
      throw groupError;
    }

    const groupData = Array.isArray(groupResult) ? groupResult[0] : groupResult;
    if (!groupData || !groupData.id) {
      throw new Error("Failed to create settlement group - no data returned");
    }

    settlementGroupId = groupData.id;
    settlementReference = groupData.settlement_reference;

    // 3. If via engineer wallet, record spending transaction (deducts from wallet batches)
    if (config.paymentChannel === "engineer_wallet" && config.engineerId) {
      if (!config.batchAllocations || config.batchAllocations.length === 0) {
        throw new Error("Batch allocation required for engineer wallet settlement. Please select which wallet batches to use.");
      }

      const walletPaymentMode = config.paymentMode === "net_banking" ? "bank_transfer" : config.paymentMode;
      const spendingResult = await recordWalletSpending(supabase, {
        engineerId: config.engineerId,
        amount: config.totalAmount,
        siteId: config.siteId,
        description: config.engineerReference || `Weekly settlement ${settlementReference} (${config.dateFrom} - ${config.dateTo})`,
        recipientType: "laborer",
        paymentMode: walletPaymentMode as any,
        moneySource: "wallet",
        batchAllocations: config.batchAllocations,
        subcontractId: config.subcontractId,
        proofUrl: config.proofUrl,
        notes: config.notes,
        transactionDate: paymentDate,
        userName: config.userName,
        userId: config.userId,
        settlementReference: settlementReference,
        settlementGroupId: settlementGroupId,
      });

      if (!spendingResult.success) {
        // Rollback: cancel the settlement group
        await supabase
          .from("settlement_groups")
          .update({
            is_cancelled: true,
            cancelled_at: new Date().toISOString(),
            cancelled_by: config.userName,
            cancelled_by_user_id: config.userId,
            cancellation_reason: `Wallet spending failed: ${spendingResult.error}`,
          })
          .eq("id", settlementGroupId);
        throw new Error(spendingResult.error || "Failed to record wallet spending");
      }

      engineerTransactionId = spendingResult.transactionId || null;

      // Update settlement_group with engineer_transaction_id
      if (engineerTransactionId) {
        await supabase
          .from("settlement_groups")
          .update({ engineer_transaction_id: engineerTransactionId })
          .eq("id", settlementGroupId);
      }
    }

    // 4. Update attendance records with settlement_group_id
    const updateData = {
      is_paid: config.paymentChannel === "direct",
      payment_date: paymentDate,
      payment_mode: config.paymentMode,
      paid_via: config.paymentChannel === "direct" ? "direct" : "engineer_wallet",
      engineer_transaction_id: engineerTransactionId,
      payment_proof_url: config.proofUrl || null,
      payment_notes: config.notes || null,
      payer_source: config.payerSource,
      payer_name: config.payerSource === "custom" ? config.customPayerName : null,
      settlement_group_id: settlementGroupId,
    };

    // Wrap attendance updates with rollback on failure to prevent orphaned settlements
    try {
      let recordsUpdated = 0;

      if (config.settlementType === "daily" || config.settlementType === "all") {
        const { error: dailyError, count } = await supabase
          .from("daily_attendance")
          .update(updateData)
          .eq("site_id", config.siteId)
          .gte("date", config.dateFrom)
          .lte("date", config.dateTo)
          .eq("is_paid", false)
          .neq("laborer_type", "contract");

        if (dailyError) throw dailyError;
        recordsUpdated += count || 0;
      }

      if (config.settlementType === "contract" || config.settlementType === "all") {
        const { error: contractError, count } = await supabase
          .from("daily_attendance")
          .update(updateData)
          .eq("site_id", config.siteId)
          .gte("date", config.dateFrom)
          .lte("date", config.dateTo)
          .eq("is_paid", false)
          .eq("laborer_type", "contract");

        if (contractError) throw contractError;
        recordsUpdated += count || 0;
      }

      if (config.settlementType === "market" || config.settlementType === "all") {
        const { error: marketError, count } = await supabase
          .from("market_laborer_attendance")
          .update(updateData)
          .eq("site_id", config.siteId)
          .gte("date", config.dateFrom)
          .lte("date", config.dateTo)
          .eq("is_paid", false);

        if (marketError) throw marketError;
        recordsUpdated += count || 0;
      }

      // Verify at least one attendance record was linked (prevents orphaned settlements)
      if (laborerCount === 0) {
        throw new Error("No attendance records to settle. Settlement requires at least one daily, contract, or market attendance record.");
      }
    } catch (attendanceError: any) {
      // Rollback: cancel the settlement group since attendance update failed
      console.error("Weekly settlement attendance update failed, rolling back settlement group:", attendanceError);
      await supabase
        .from("settlement_groups")
        .update({
          is_cancelled: true,
          cancelled_at: new Date().toISOString(),
          cancelled_by: config.userName,
          cancelled_by_user_id: config.userId,
          cancellation_reason: `Attendance update failed: ${attendanceError.message || 'Unknown error'}`,
        })
        .eq("id", settlementGroupId);
      throw attendanceError;
    }

    // NOTE: We no longer create salary expenses here!
    // Expenses are now derived from settlement_groups via the v_all_expenses view.

    return {
      success: true,
      settlementReference,
      settlementGroupId,
      engineerTransactionId: engineerTransactionId || undefined,
    };
  } catch (err: any) {
    console.error("Weekly settlement error:", err);
    return {
      success: false,
      error: err.message || "Failed to process weekly settlement",
    };
  }
}

/**
 * Build a description string for the expense record
 */
function buildExpenseDescription(config: SettlementConfig, laborerCount: number): string {
  const parts: string[] = [];

  parts.push(`Laborer salary (${laborerCount} ${laborerCount === 1 ? "laborer" : "laborers"})`);

  // Add payer info
  const payerLabel = getPayerLabel(config.payerSource, config.customPayerName);
  if (payerLabel !== "Own Money") {
    parts.push(`via ${payerLabel}`);
  }

  // Add notes if present
  if (config.notes) {
    parts.push(config.notes);
  }

  return parts.join(" - ");
}

/**
 * Get display label for payer source
 */
function getPayerLabel(source: PayerSource, customName?: string): string {
  switch (source) {
    case "own_money":
      return "Own Money";
    case "client_money":
      return "Client Money";
    case "mothers_money":
      return "Mother's Money";
    case "custom":
      return customName || "Custom";
    default:
      return source;
  }
}

/**
 * Cancel a settlement and revert attendance records
 * Now marks settlement_groups as cancelled instead of deleting expenses.
 */
export async function cancelSettlement(
  supabase: SupabaseClient,
  config: {
    siteId: string;
    records: { sourceType: "daily" | "market"; sourceId: string; expenseId?: string; engineerTransactionId?: string; settlementGroupId?: string }[];
    userId: string;
    userName: string;
    reason?: string;
  }
): Promise<SettlementResult> {
  try {
    // Reset attendance records
    const dailyIds = config.records
      .filter((r) => r.sourceType === "daily")
      .map((r) => r.sourceId);
    const marketIds = config.records
      .filter((r) => r.sourceType === "market")
      .map((r) => r.sourceId);

    const resetData = {
      is_paid: false,
      payment_date: null,
      payment_mode: null,
      paid_via: null,
      engineer_transaction_id: null,
      payment_proof_url: null,
      payment_notes: null,
      payer_source: null,
      payer_name: null,
      expense_id: null,
      settlement_group_id: null,
    };

    if (dailyIds.length > 0) {
      const { error } = await supabase
        .from("daily_attendance")
        .update(resetData)
        .in("id", dailyIds);
      if (error) throw error;
    }

    if (marketIds.length > 0) {
      const { error } = await supabase
        .from("market_laborer_attendance")
        .update(resetData)
        .in("id", marketIds);
      if (error) throw error;
    }

    // Mark settlement_groups as cancelled (instead of deleting expenses)
    const groupIds = [...new Set(config.records.map((r) => r.settlementGroupId).filter(Boolean))];
    for (const groupId of groupIds) {
      // Check if group still has linked records
      const { count: dailyCount } = await supabase
        .from("daily_attendance")
        .select("*", { count: "exact", head: true })
        .eq("settlement_group_id", groupId);

      const { count: marketCount } = await supabase
        .from("market_laborer_attendance")
        .select("*", { count: "exact", head: true })
        .eq("settlement_group_id", groupId);

      if ((dailyCount || 0) + (marketCount || 0) === 0) {
        // No more linked records, mark the group as cancelled
        await (supabase.from("settlement_groups") as any)
          .update({
            is_cancelled: true,
            cancelled_at: new Date().toISOString(),
            cancelled_by: config.userName,
            cancelled_by_user_id: config.userId,
            cancellation_reason: config.reason || null,
          })
          .eq("id", groupId);
      }
    }

    // Handle engineer transactions (legacy - still needed for old data)
    const txIds = [...new Set(config.records.map((r) => r.engineerTransactionId).filter(Boolean))];
    for (const txId of txIds) {
      // Check if transaction still has linked records
      const { count: dailyCount } = await supabase
        .from("daily_attendance")
        .select("*", { count: "exact", head: true })
        .eq("engineer_transaction_id", txId);

      const { count: marketCount } = await supabase
        .from("market_laborer_attendance")
        .select("*", { count: "exact", head: true })
        .eq("engineer_transaction_id", txId);

      if ((dailyCount || 0) + (marketCount || 0) === 0) {
        // No more linked records, cancel the transaction
        await supabase
          .from("site_engineer_transactions")
          .update({
            settlement_status: "cancelled",
            cancelled_at: new Date().toISOString(),
            cancelled_by: config.userName,
            cancelled_by_user_id: config.userId,
            cancellation_reason: config.reason || null,
          })
          .eq("id", txId);
      }
    }

    // Delete old-style linked expenses (for backward compatibility during migration)
    const expenseIds = [...new Set(config.records.map((r) => r.expenseId).filter(Boolean))];
    if (expenseIds.length > 0) {
      await supabase.from("expenses").delete().in("id", expenseIds);
    }

    return { success: true };
  } catch (err: any) {
    console.error("Cancel settlement error:", err);
    return {
      success: false,
      error: err.message || "Failed to cancel settlement",
    };
  }
}

/**
 * Get subcontract_id from existing attendance records.
 * This is used when re-settling after a cancel to preserve the subcontract link.
 */
async function getSubcontractFromAttendanceRecords(
  supabase: SupabaseClient,
  records: { sourceType: "daily" | "market"; sourceId: string }[]
): Promise<string | null> {
  // Check daily attendance records first
  const dailyIds = records.filter((r) => r.sourceType === "daily").map((r) => r.sourceId);
  if (dailyIds.length > 0) {
    const { data: dailyData } = await supabase
      .from("daily_attendance")
      .select("subcontract_id")
      .in("id", dailyIds)
      .not("subcontract_id", "is", null)
      .limit(1);

    if (dailyData && dailyData.length > 0 && dailyData[0].subcontract_id) {
      return dailyData[0].subcontract_id;
    }
  }

  // Check market attendance records
  const marketIds = records.filter((r) => r.sourceType === "market").map((r) => r.sourceId);
  if (marketIds.length > 0) {
    const { data: marketData } = await (supabase
      .from("market_laborer_attendance") as any)
      .select("subcontract_id")
      .in("id", marketIds)
      .not("subcontract_id", "is", null)
      .limit(1);

    if (marketData && marketData.length > 0 && marketData[0].subcontract_id) {
      return marketData[0].subcontract_id;
    }
  }

  return null;
}

// ============================================================================
// CONTRACT PAYMENT FUNCTIONS (NEW)
// ============================================================================

export interface ContractPaymentResult extends SettlementResult {
  paymentId?: string;
  paymentReference?: string;
  allocations?: PaymentWeekAllocation[];
}

/**
 * Process a contract laborer payment with auto-allocation for salary payments.
 * Each payment gets its own unique reference code.
 */
export async function processContractPayment(
  supabase: SupabaseClient,
  config: ContractPaymentConfig
): Promise<ContractPaymentResult> {
  try {
    const paymentDate = dayjs().format("YYYY-MM-DD");
    let engineerTransactionId: string | null = null;
    let settlementGroupId: string | undefined;
    let settlementReference: string | undefined;
    let paymentReference: string | undefined;
    let paymentId: string | undefined;
    const allocations: PaymentWeekAllocation[] = [];

    // 1. Create settlement_group FIRST using atomic function (guaranteed unique reference)
    const { data: groupResult, error: groupError } = await supabase.rpc(
      "create_settlement_group",
      {
        p_site_id: config.siteId,
        p_settlement_date: config.actualPaymentDate,
        p_total_amount: config.amount,
        p_laborer_count: 1,
        p_payment_channel: config.paymentChannel,
        p_payment_mode: config.paymentMode,
        p_payer_source: config.payerSource,
        p_payer_name: config.payerSource === "custom" ? config.customPayerName : null,
        p_proof_url: config.proofUrl || null,
        p_notes: config.notes || null,
        p_subcontract_id: config.subcontractId || null,
        p_engineer_transaction_id: null,
        p_created_by: config.userId,
        p_created_by_name: config.userName,
        p_payment_type: config.paymentType,
        p_actual_payment_date: config.actualPaymentDate,
      }
    );

    if (groupError) {
      console.error("Error creating settlement_group:", groupError);
      throw groupError;
    }

    const groupData = Array.isArray(groupResult) ? groupResult[0] : groupResult;
    if (!groupData || !groupData.id) {
      throw new Error("Failed to create settlement group - no data returned");
    }

    settlementGroupId = groupData.id;
    settlementReference = groupData.settlement_reference;

    // 2. If via engineer wallet, create engineer transaction
    if (config.paymentChannel === "engineer_wallet" && config.engineerId) {
      const { data: txData, error: txError } = await (supabase
        .from("site_engineer_transactions") as any)
        .insert({
          user_id: config.engineerId,
          site_id: config.siteId,
          transaction_type: "received_from_company",
          settlement_status: "pending_settlement",
          amount: config.amount,
          description: `Contract payment for ${config.laborerName}`,
          payment_mode: config.paymentMode,
          proof_url: config.proofUrl || null,
          is_settled: false,
          recorded_by: config.userName,
          recorded_by_user_id: config.userId,
          related_subcontract_id: config.subcontractId || null,
          settlement_group_id: settlementGroupId,
          settlement_reference: settlementReference,
        })
        .select()
        .single();

      if (txError) {
        // Rollback: cancel settlement group
        await supabase
          .from("settlement_groups")
          .update({
            is_cancelled: true,
            cancelled_at: new Date().toISOString(),
            cancelled_by: config.userName,
            cancelled_by_user_id: config.userId,
            cancellation_reason: `Engineer transaction failed: ${txError.message}`,
          })
          .eq("id", settlementGroupId);
        throw txError;
      }

      engineerTransactionId = txData.id;

      // Update settlement_group with engineer_transaction_id
      await supabase
        .from("settlement_groups")
        .update({ engineer_transaction_id: engineerTransactionId })
        .eq("id", settlementGroupId);
    }

    // 3 & 4. Create labor_payments record with retry on reference collision
    const { data: paymentData, error: paymentError } = await insertLaborPaymentWithRetry(
      supabase,
      {
        laborer_id: config.laborerId,
        site_id: config.siteId,
        payment_date: paymentDate,
        payment_for_date: config.paymentForDate,
        actual_payment_date: config.actualPaymentDate,
        amount: config.amount,
        payment_mode: config.paymentMode,
        payment_channel: config.paymentChannel,
        payment_type: config.paymentType,
        is_under_contract: true,
        subcontract_id: config.subcontractId || null,
        proof_url: config.proofUrl || null,
        paid_by: config.userName,
        paid_by_user_id: config.userId,
        recorded_by: config.userName,
        recorded_by_user_id: config.userId,
        notes: config.notes || null,
        settlement_group_id: settlementGroupId,
        site_engineer_transaction_id: engineerTransactionId,
      },
      config.siteId
    );

    if (paymentError) {
      console.error("Error creating labor_payment:", paymentError);
      throw paymentError;
    }

    paymentId = paymentData.id;

    // 6. If salary payment, allocate to weeks (oldest first)
    if (config.paymentType === "salary" && paymentId) {
      const allocResult = await allocateSalaryToWeeks(supabase, {
        laborPaymentId: paymentId,
        laborerId: config.laborerId,
        siteId: config.siteId,
        amount: config.amount,
        paymentDate: config.actualPaymentDate,
      });
      allocations.push(...allocResult);
    }

    // 7. If advance payment, update laborer's total_advance_given
    if (config.paymentType === "advance") {
      const { error: updateError } = await supabase.rpc("increment_laborer_advance", {
        p_laborer_id: config.laborerId,
        p_amount: config.amount,
      });

      // If RPC doesn't exist, do it manually
      if (updateError) {
        console.warn("increment_laborer_advance RPC not found, updating manually");
        const { data: laborer } = await supabase
          .from("laborers")
          .select("total_advance_given")
          .eq("id", config.laborerId)
          .single();

        await supabase
          .from("laborers")
          .update({
            total_advance_given: (laborer?.total_advance_given || 0) + config.amount,
          })
          .eq("id", config.laborerId);
      }
    }

    return {
      success: true,
      paymentId,
      paymentReference,
      settlementReference,
      settlementGroupId,
      engineerTransactionId: engineerTransactionId || undefined,
      allocations,
    };
  } catch (err: any) {
    console.error("Contract payment error:", err);
    return {
      success: false,
      error: err.message || "Failed to process contract payment",
    };
  }
}

/**
 * Allocate salary payment to weeks chronologically (oldest unpaid first).
 * Creates payment_week_allocations records and marks attendance as paid when fully covered.
 */
async function allocateSalaryToWeeks(
  supabase: SupabaseClient,
  config: {
    laborPaymentId: string;
    laborerId: string;
    siteId: string;
    amount: number;
    paymentDate: string;
  }
): Promise<PaymentWeekAllocation[]> {
  const allocations: PaymentWeekAllocation[] = [];
  let remainingAmount = config.amount;

  // Get all unpaid or partially paid weeks for this laborer, ordered oldest first
  const { data: attendanceData, error: attendanceError } = await supabase
    .from("daily_attendance")
    .select(`
      id,
      date,
      daily_earnings,
      is_paid,
      payment_id
    `)
    .eq("site_id", config.siteId)
    .eq("laborer_id", config.laborerId)
    .eq("is_paid", false)
    .order("date", { ascending: true });

  if (attendanceError || !attendanceData) {
    console.warn("Could not fetch attendance for allocation:", attendanceError);
    return allocations;
  }

  // Group by week
  const weeklyData = new Map<string, { weekStart: string; weekEnd: string; totalDue: number; attendanceIds: string[] }>();

  for (const att of attendanceData) {
    const d = dayjs(att.date);
    const weekStart = d.day(0).format("YYYY-MM-DD"); // Sunday
    const weekEnd = d.day(6).format("YYYY-MM-DD"); // Saturday

    if (!weeklyData.has(weekStart)) {
      weeklyData.set(weekStart, { weekStart, weekEnd, totalDue: 0, attendanceIds: [] });
    }
    const week = weeklyData.get(weekStart)!;
    week.totalDue += att.daily_earnings || 0;
    week.attendanceIds.push(att.id);
  }

  // Sort weeks by date (oldest first)
  const sortedWeeks = Array.from(weeklyData.values()).sort(
    (a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime()
  );

  // Allocate payment to weeks
  for (const week of sortedWeeks) {
    if (remainingAmount <= 0) break;

    const allocatedAmount = Math.min(remainingAmount, week.totalDue);

    if (allocatedAmount > 0) {
      // Create allocation record
      const { data: allocData, error: allocError } = await supabase
        .from("payment_week_allocations")
        .insert({
          labor_payment_id: config.laborPaymentId,
          laborer_id: config.laborerId,
          site_id: config.siteId,
          week_start: week.weekStart,
          week_end: week.weekEnd,
          allocated_amount: allocatedAmount,
        })
        .select()
        .single();

      if (allocError) {
        console.error("Error creating week allocation:", allocError);
        continue;
      }

      allocations.push({
        id: allocData.id,
        laborPaymentId: config.laborPaymentId,
        laborerId: config.laborerId,
        siteId: config.siteId,
        weekStart: week.weekStart,
        weekEnd: week.weekEnd,
        allocatedAmount,
        createdAt: allocData.created_at,
      });

      // If this allocation covers the full week, mark attendance as paid
      if (allocatedAmount >= week.totalDue) {
        await supabase
          .from("daily_attendance")
          .update({
            is_paid: true,
            payment_date: config.paymentDate,
            payment_id: config.laborPaymentId,
          })
          .in("id", week.attendanceIds);
      }

      remainingAmount -= allocatedAmount;
    }
  }

  return allocations;
}

/**
 * Get payment details by reference code (for ref code popup)
 * Handles both formats:
 * - PAY-YYYYMM-NNN (new format from labor_payments.payment_reference)
 * - SET-YYYYMM-NNN (old format from settlement_groups.settlement_reference)
 */
export async function getPaymentByReference(
  supabase: SupabaseClient,
  reference: string
): Promise<PaymentDetails | null> {
  try {
    let payment: any = null;
    let settlementGroup: any = null;

    // Detect reference format and query accordingly
    if (reference.startsWith("PAY-")) {
      // New format: Query directly by payment_reference
      const { data, error } = await supabase
        .from("labor_payments")
        .select(`
          *,
          laborers(name, labor_roles(name)),
          subcontracts(title),
          settlement_groups(settlement_reference, payer_source, payer_name, is_cancelled)
        `)
        .eq("payment_reference", reference)
        .single();

      if (!error && data) {
        payment = data;
        settlementGroup = (data as any).settlement_groups;
      }
    }

    // If not found by PAY-* or reference is SET-*, query through settlement_groups
    if (!payment && reference.startsWith("SET-")) {
      // Old format: Query settlement_groups first, then labor_payments
      const { data: sg, error: sgError } = await (supabase
        .from("settlement_groups") as any)
        .select("id, settlement_reference, payer_source, payer_name, proof_url, notes, payment_mode, payment_channel, actual_payment_date, settlement_date, total_amount, subcontract_id, created_at, created_by_name")
        .eq("settlement_reference", reference)
        .single();

      if (sgError || !sg) {
        console.error("Settlement group not found:", sgError);
        return null;
      }

      settlementGroup = sg;

      // Query labor_payments by settlement_group_id
      const { data: paymentData, error: paymentError } = await supabase
        .from("labor_payments")
        .select(`
          *,
          laborers(name, labor_roles(name)),
          subcontracts(title)
        `)
        .eq("settlement_group_id", sg.id)
        .limit(1)
        .maybeSingle();

      if (paymentData) {
        payment = paymentData;
      } else {
        // Old settlement without labor_payments record (daily/market settlement)
        // Return settlement_group data as payment details
        return {
          paymentId: sg.id,
          paymentReference: sg.settlement_reference,
          amount: sg.total_amount,
          paymentType: "salary",
          actualPaymentDate: sg.actual_payment_date || sg.settlement_date,
          paymentForDate: sg.settlement_date,
          weeksCovered: [],
          laborerId: "",
          laborerName: "Multiple Laborers",
          laborerRole: undefined,
          paidBy: sg.created_by_name || "Unknown",
          paidByUserId: "",
          paymentMode: sg.payment_mode,
          paymentChannel: sg.payment_channel,
          proofUrl: sg.proof_url,
          notes: sg.notes,
          subcontractId: sg.subcontract_id,
          subcontractTitle: null,
          payerSource: sg.payer_source,
          payerName: sg.payer_name,
          settlementGroupId: sg.id,
          settlementReference: sg.settlement_reference,
          createdAt: sg.created_at,
        };
      }
    }

    if (!payment) {
      console.error("Payment not found for reference:", reference);
      return null;
    }

    // Fetch allocations
    const { data: allocations } = await supabase
      .from("payment_week_allocations")
      .select("*")
      .eq("labor_payment_id", payment.id)
      .order("week_start", { ascending: true });

    const weeksCovered = (allocations || []).map((a: any) => ({
      weekStart: a.week_start,
      weekEnd: a.week_end,
      allocatedAmount: a.allocated_amount,
    }));

    return {
      paymentId: payment.id,
      paymentReference: payment.payment_reference || settlementGroup?.settlement_reference || reference,
      amount: payment.amount,
      paymentType: payment.payment_type || "salary",
      actualPaymentDate: payment.actual_payment_date || payment.payment_date,
      paymentForDate: payment.payment_for_date,
      weeksCovered,
      laborerId: payment.laborer_id,
      laborerName: (payment as any).laborers?.name || "Unknown",
      laborerRole: (payment as any).laborers?.labor_roles?.name,
      paidBy: payment.paid_by,
      paidByUserId: payment.paid_by_user_id,
      paymentMode: payment.payment_mode,
      paymentChannel: payment.payment_channel,
      proofUrl: payment.proof_url,
      notes: payment.notes,
      subcontractId: payment.subcontract_id,
      subcontractTitle: (payment as any).subcontracts?.title || null,
      payerSource: settlementGroup?.payer_source || null,
      payerName: settlementGroup?.payer_name || null,
      settlementGroupId: payment.settlement_group_id,
      settlementReference: settlementGroup?.settlement_reference || (payment as any).settlement_groups?.settlement_reference || null,
      createdAt: payment.created_at,
    };
  } catch (err: any) {
    console.error("Error fetching payment by reference:", err);
    return null;
  }
}

/**
 * Update an existing contract payment
 */
export async function updateContractPayment(
  supabase: SupabaseClient,
  paymentId: string,
  updates: {
    amount?: number;
    actualPaymentDate?: string;
    paymentType?: ContractPaymentType;
    paymentMode?: PaymentMode;
    proofUrl?: string | null;
    notes?: string | null;
    subcontractId?: string | null;
    userId: string;
    userName: string;
  }
): Promise<ContractPaymentResult> {
  try {
    // Get existing payment
    const { data: existingPayment, error: fetchError } = await supabase
      .from("labor_payments")
      .select("*")
      .eq("id", paymentId)
      .single();

    if (fetchError || !existingPayment) {
      throw new Error("Payment not found");
    }

    // Build update object
    const updateData: any = {};
    if (updates.amount !== undefined) updateData.amount = updates.amount;
    if (updates.actualPaymentDate !== undefined) updateData.actual_payment_date = updates.actualPaymentDate;
    if (updates.paymentType !== undefined) updateData.payment_type = updates.paymentType;
    if (updates.paymentMode !== undefined) updateData.payment_mode = updates.paymentMode;
    if (updates.proofUrl !== undefined) updateData.proof_url = updates.proofUrl;
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    if (updates.subcontractId !== undefined) updateData.subcontract_id = updates.subcontractId;

    // Update the payment
    const { error: updateError } = await supabase
      .from("labor_payments")
      .update(updateData)
      .eq("id", paymentId);

    if (updateError) throw updateError;

    // If amount or payment_type changed, recalculate allocations
    if (updates.amount !== undefined || updates.paymentType !== undefined) {
      const newPaymentType = updates.paymentType || existingPayment.payment_type || "salary";
      const newAmount = updates.amount || existingPayment.amount;

      // Delete existing allocations
      await supabase
        .from("payment_week_allocations")
        .delete()
        .eq("labor_payment_id", paymentId);

      // Reset attendance records that were marked paid by this payment
      await supabase
        .from("daily_attendance")
        .update({ is_paid: false, payment_id: null })
        .eq("payment_id", paymentId);

      // Re-allocate if salary payment
      if (newPaymentType === "salary") {
        await allocateSalaryToWeeks(supabase, {
          laborPaymentId: paymentId,
          laborerId: existingPayment.laborer_id,
          siteId: existingPayment.site_id,
          amount: newAmount,
          paymentDate: updates.actualPaymentDate || existingPayment.actual_payment_date || existingPayment.payment_date,
        });
      }
    }

    // Update settlement_group if it exists
    if (existingPayment.settlement_group_id) {
      const groupUpdates: any = {};
      if (updates.amount !== undefined) groupUpdates.total_amount = updates.amount;
      if (updates.actualPaymentDate !== undefined) {
        groupUpdates.actual_payment_date = updates.actualPaymentDate;
        groupUpdates.settlement_date = updates.actualPaymentDate; // Sync with v_all_expenses view
      }
      if (updates.paymentType !== undefined) groupUpdates.payment_type = updates.paymentType;
      if (updates.paymentMode !== undefined) groupUpdates.payment_mode = updates.paymentMode;
      if (updates.proofUrl !== undefined) groupUpdates.proof_url = updates.proofUrl;
      if (updates.notes !== undefined) groupUpdates.notes = updates.notes;

      if (Object.keys(groupUpdates).length > 0) {
        await (supabase.from("settlement_groups") as any)
          .update(groupUpdates)
          .eq("id", existingPayment.settlement_group_id);
      }
    }

    return {
      success: true,
      paymentId,
      paymentReference: existingPayment.payment_reference,
    };
  } catch (err: any) {
    console.error("Update contract payment error:", err);
    return {
      success: false,
      error: err.message || "Failed to update payment",
    };
  }
}

/**
 * Cancel/delete a contract payment (soft delete)
 */
export async function cancelContractPayment(
  supabase: SupabaseClient,
  paymentId: string,
  reason: string,
  userId: string,
  userName: string
): Promise<ContractPaymentResult> {
  try {
    // Get existing payment
    const { data: existingPayment, error: fetchError } = await supabase
      .from("labor_payments")
      .select("*")
      .eq("id", paymentId)
      .single();

    if (fetchError || !existingPayment) {
      throw new Error("Payment not found");
    }

    // Delete payment allocations
    await supabase
      .from("payment_week_allocations")
      .delete()
      .eq("labor_payment_id", paymentId);

    // Reset attendance records that were marked paid by this payment
    await supabase
      .from("daily_attendance")
      .update({ is_paid: false, payment_id: null })
      .eq("payment_id", paymentId);

    // If advance payment, reduce laborer's total_advance_given
    if (existingPayment.payment_type === "advance") {
      const { data: laborer } = await supabase
        .from("laborers")
        .select("total_advance_given")
        .eq("id", existingPayment.laborer_id)
        .single();

      await supabase
        .from("laborers")
        .update({
          total_advance_given: Math.max(0, (laborer?.total_advance_given || 0) - existingPayment.amount),
        })
        .eq("id", existingPayment.laborer_id);
    }

    // Delete the labor_payment record
    await supabase
      .from("labor_payments")
      .delete()
      .eq("id", paymentId);

    // Cancel the settlement_group if it exists
    if (existingPayment.settlement_group_id) {
      await (supabase.from("settlement_groups") as any)
        .update({
          is_cancelled: true,
          cancelled_at: new Date().toISOString(),
          cancelled_by: userName,
          cancelled_by_user_id: userId,
          cancellation_reason: reason,
        })
        .eq("id", existingPayment.settlement_group_id);
    }

    // Cancel engineer transaction if it exists
    if (existingPayment.site_engineer_transaction_id) {
      await supabase
        .from("site_engineer_transactions")
        .update({
          settlement_status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancelled_by: userName,
          cancelled_by_user_id: userId,
          cancellation_reason: reason,
        })
        .eq("id", existingPayment.site_engineer_transaction_id);
    }

    return {
      success: true,
      paymentId,
    };
  } catch (err: any) {
    console.error("Cancel contract payment error:", err);
    return {
      success: false,
      error: err.message || "Failed to cancel payment",
    };
  }
}

/**
 * Contract payment history record for list display
 */
export interface ContractPaymentHistoryRecord {
  id: string;
  paymentReference: string | null;
  settlementReference: string | null;
  laborerId: string;
  laborerName: string;
  laborerRole: string | null;
  amount: number;
  paymentType: ContractPaymentType;
  paymentMode: PaymentMode | null;
  paymentChannel: PaymentChannel | null;
  actualPaymentDate: string;
  paymentDate: string;
  // Payment source - who actually paid (company money, own money, trust account, etc.)
  payerSource: string | null;
  payerName: string | null;
  // Audit fields
  recordedBy: string;
  recordedByUserId: string | null;
  createdAt: string;
  // Legacy field - kept for backward compatibility (same as recordedBy)
  paidBy: string;
  proofUrl: string | null;
  notes: string | null;
  subcontractId: string | null;
  subcontractTitle: string | null;
}

/**
 * Fetch all contract labor payments for a site, ordered by date (newest first)
 */
export async function getContractPaymentHistory(
  supabase: SupabaseClient,
  siteId: string,
  options?: {
    limit?: number;
    offset?: number;
    laborerId?: string;
    dateFrom?: string;
    dateTo?: string;
  }
): Promise<{ payments: ContractPaymentHistoryRecord[]; total: number }> {
  try {
    // Build query
    let query = supabase
      .from("labor_payments")
      .select(`
        id,
        payment_reference,
        laborer_id,
        amount,
        payment_type,
        payment_mode,
        payment_channel,
        actual_payment_date,
        payment_date,
        paid_by,
        paid_by_user_id,
        recorded_by,
        recorded_by_user_id,
        proof_url,
        notes,
        subcontract_id,
        created_at,
        settlement_group_id,
        laborers(name, labor_roles(name)),
        subcontracts(title),
        settlement_groups(settlement_reference, payer_source, payer_name, is_cancelled)
      `, { count: "exact" })
      .eq("site_id", siteId)
      .eq("is_under_contract", true);

    // Apply filters
    if (options?.laborerId) {
      query = query.eq("laborer_id", options.laborerId);
    }
    if (options?.dateFrom) {
      query = query.gte("actual_payment_date", options.dateFrom);
    }
    if (options?.dateTo) {
      query = query.lte("actual_payment_date", options.dateTo);
    }

    // Order by date (newest first) and apply pagination
    query = query.order("actual_payment_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("Error fetching contract payment history:", error);
      throw error;
    }

    const payments: ContractPaymentHistoryRecord[] = (data || []).map((p: any) => ({
      id: p.id,
      paymentReference: p.payment_reference,
      // Don't show settlement info for cancelled settlements
      settlementReference: p.settlement_groups?.is_cancelled ? null : (p.settlement_groups?.settlement_reference || null),
      laborerId: p.laborer_id,
      laborerName: p.laborers?.name || "Unknown",
      laborerRole: p.laborers?.labor_roles?.name || null,
      amount: p.amount,
      paymentType: p.payment_type || "salary",
      paymentMode: p.payment_mode,
      paymentChannel: p.payment_channel,
      actualPaymentDate: p.actual_payment_date || p.payment_date,
      paymentDate: p.payment_date,
      // Payment source from settlement_groups (don't show for cancelled)
      payerSource: p.settlement_groups?.is_cancelled ? null : (p.settlement_groups?.payer_source || null),
      payerName: p.settlement_groups?.is_cancelled ? null : (p.settlement_groups?.payer_name || null),
      // Audit fields
      recordedBy: p.recorded_by || p.paid_by || "Unknown",
      recordedByUserId: p.recorded_by_user_id || p.paid_by_user_id || null,
      createdAt: p.created_at,
      // Legacy field
      paidBy: p.paid_by || "Unknown",
      proofUrl: p.proof_url,
      notes: p.notes,
      subcontractId: p.subcontract_id,
      subcontractTitle: p.subcontracts?.title || null,
    }));

    return { payments, total: count || 0 };
  } catch (err: any) {
    console.error("Error in getContractPaymentHistory:", err);
    return { payments: [], total: 0 };
  }
}

// ============================================================================
// WATERFALL CONTRACT PAYMENT (OLDEST WEEK FIRST)
// ============================================================================

export interface WaterfallWeekData {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  allocatedAmount: number;
  laborers: {
    laborerId: string;
    laborerName: string;
    balance: number;
    subcontractId: string | null;
  }[];
}

export interface WaterfallContractPaymentConfig {
  siteId: string;
  weeks: WaterfallWeekData[];
  totalAmount: number;
  paymentType: ContractPaymentType;
  actualPaymentDate: string;
  paymentMode: PaymentMode;
  paymentChannel: PaymentChannel;
  payerSource: PayerSource;
  customPayerName?: string;
  engineerId?: string;
  proofUrl?: string;
  notes?: string;
  subcontractId?: string;
  userId: string;
  userName: string;
}

export interface WaterfallContractPaymentResult extends SettlementResult {
  paymentIds?: string[];
  weekAllocations?: {
    weekLabel: string;
    weekStart: string;
    allocated: number;
    laborerCount: number;
  }[];
}

/**
 * Process a waterfall contract payment - allocates to oldest week first, then overflow to next.
 * Creates labor_payments records for each laborer in each week that receives payment.
 * All payments share the same settlement_reference.
 */
export async function processWaterfallContractPayment(
  supabase: SupabaseClient,
  config: WaterfallContractPaymentConfig
): Promise<WaterfallContractPaymentResult> {
  try {
    const paymentDate = dayjs().format("YYYY-MM-DD");
    let engineerTransactionId: string | null = null;
    let settlementGroupId: string | undefined;
    let settlementReference: string | undefined;
    const paymentIds: string[] = [];
    const weekAllocations: { weekLabel: string; weekStart: string; allocated: number; laborerCount: number }[] = [];

    // Note: We allow salary payments even with empty weeks (excess/overpayment)
    // The payment will be recorded in settlement_groups and tracked as excess
    // This allows users to prepay or overpay, which shows as "Excess Paid" in the dashboard

    // Map payment mode for database compatibility (net_banking -> bank_transfer)
    // The labor_payments table only accepts: cash, upi, bank_transfer
    const normalizedPaymentMode = config.paymentMode === "net_banking" ? "bank_transfer" : config.paymentMode;

    // Count total laborers across all weeks (0 for advance/other with no weeks)
    const totalLaborers = config.weeks.reduce((sum, w) => sum + w.laborers.length, 0);

    // Determine effective payment type:
    // If payment type is 'salary' but weeks is empty, it's an excess/overpayment
    const effectivePaymentType = (config.paymentType === "salary" && config.weeks.length === 0)
      ? "excess"
      : config.paymentType;

    // Build description for settlement group
    const weekRangeDesc = config.weeks.length === 0
      ? (effectivePaymentType === "advance" ? "Advance Payment"
         : effectivePaymentType === "excess" ? "Excess/Overpayment"
         : "Other Payment")
      : config.weeks.length === 1
        ? config.weeks[0].weekLabel
        : `${config.weeks[0].weekLabel} to ${config.weeks[config.weeks.length - 1].weekLabel}`;

    // 1. Create settlement_group FIRST using atomic function (guaranteed unique reference)
    const notesText = config.notes
      ? (config.weeks.length === 0 ? `${weekRangeDesc}: ${config.notes}` : `Waterfall (${weekRangeDesc}): ${config.notes}`)
      : (config.weeks.length === 0 ? weekRangeDesc : `Contract payment covering ${config.weeks.length} week(s): ${weekRangeDesc}`);

    const { data: groupResult, error: groupError } = await supabase.rpc(
      "create_settlement_group",
      {
        p_site_id: config.siteId,
        p_settlement_date: config.actualPaymentDate,
        p_total_amount: config.totalAmount,
        p_laborer_count: totalLaborers,
        p_payment_channel: config.paymentChannel,
        p_payment_mode: normalizedPaymentMode,
        p_payer_source: config.payerSource,
        p_payer_name: config.payerSource === "custom" || config.payerSource === "other_site_money"
          ? config.customPayerName
          : null,
        p_proof_url: config.proofUrl || null,
        p_notes: notesText,
        p_subcontract_id: config.subcontractId || null,
        p_engineer_transaction_id: null,
        p_created_by: config.userId,
        p_created_by_name: config.userName,
        p_payment_type: effectivePaymentType,
        p_actual_payment_date: config.actualPaymentDate,
      }
    );

    if (groupError) {
      console.error("Error creating settlement_group:", groupError);
      throw groupError;
    }

    const groupData = Array.isArray(groupResult) ? groupResult[0] : groupResult;
    if (!groupData || !groupData.id) {
      throw new Error("Failed to create settlement group - no data returned");
    }

    settlementGroupId = groupData.id;
    settlementReference = groupData.settlement_reference;

    // 2. If via engineer wallet, create engineer transaction
    if (config.paymentChannel === "engineer_wallet" && config.engineerId) {
      const { data: txData, error: txError } = await (supabase
        .from("site_engineer_transactions") as any)
        .insert({
          user_id: config.engineerId,
          site_id: config.siteId,
          transaction_type: "received_from_company",
          settlement_status: "pending_settlement",
          amount: config.totalAmount,
          description: `Contract payment (${weekRangeDesc}) - ${totalLaborers} laborers`,
          payment_mode: normalizedPaymentMode,
          proof_url: config.proofUrl || null,
          is_settled: false,
          recorded_by: config.userName,
          recorded_by_user_id: config.userId,
          related_subcontract_id: config.subcontractId || null,
          settlement_group_id: settlementGroupId,
          settlement_reference: settlementReference,
        })
        .select()
        .single();

      if (txError) {
        // Rollback: cancel settlement group
        await supabase
          .from("settlement_groups")
          .update({
            is_cancelled: true,
            cancelled_at: new Date().toISOString(),
            cancelled_by: config.userName,
            cancelled_by_user_id: config.userId,
            cancellation_reason: `Engineer transaction failed: ${txError.message}`,
          })
          .eq("id", settlementGroupId);
        throw txError;
      }

      engineerTransactionId = txData.id;

      // Update settlement_group with engineer_transaction_id
      await supabase
        .from("settlement_groups")
        .update({ engineer_transaction_id: engineerTransactionId })
        .eq("id", settlementGroupId);
    }

    // 3. Process each week (already sorted oldest first by the caller)
    for (const week of config.weeks) {
      if (week.allocatedAmount <= 0 || week.laborers.length === 0) continue;

      // Calculate total due for this week for proportional split within the week
      const weekTotalDue = week.laborers.reduce((sum, l) => sum + l.balance, 0);

      let laborersProcessed = 0;

      // Pre-calculate amounts using remainder distribution to avoid rounding loss
      // Filter laborers with positive balance first
      const activeLaborers = week.laborers.filter(l => l.balance > 0);
      let allocatedSoFar = 0;
      const laborerAmounts = new Map<string, number>();

      activeLaborers.forEach((laborer, index) => {
        let finalAmount: number;
        if (index === activeLaborers.length - 1) {
          // Last laborer gets the remainder to ensure exact total
          finalAmount = Math.min(week.allocatedAmount - allocatedSoFar, laborer.balance);
        } else {
          // Use floor for intermediate laborers to avoid over-allocation
          const proportion = laborer.balance / weekTotalDue;
          finalAmount = Math.min(Math.floor(week.allocatedAmount * proportion), laborer.balance);
        }
        laborerAmounts.set(laborer.laborerId, Math.max(0, finalAmount));
        allocatedSoFar += Math.max(0, finalAmount);
      });

      // 5. Create labor_payments for each laborer in this week (proportional within week)
      for (const laborer of week.laborers) {
        if (laborer.balance <= 0) continue;

        // Get pre-calculated amount
        const finalAmount = laborerAmounts.get(laborer.laborerId) || 0;

        if (finalAmount <= 0) continue;

        // Idempotency guard: skip if payment already exists for this laborer+settlement+week
        const { data: existingPayment } = await supabase
          .from("labor_payments")
          .select("id")
          .eq("laborer_id", laborer.laborerId)
          .eq("settlement_group_id", settlementGroupId)
          .eq("payment_for_date", week.weekStart)
          .maybeSingle();

        if (existingPayment) {
          paymentIds.push(existingPayment.id);
          laborersProcessed++;
          continue;
        }

        // Create labor_payments record with retry on reference collision
        const { data: paymentData, error: paymentError } = await insertLaborPaymentWithRetry(
          supabase,
          {
            laborer_id: laborer.laborerId,
            site_id: config.siteId,
            payment_date: paymentDate,
            payment_for_date: week.weekStart,
            actual_payment_date: config.actualPaymentDate,
            amount: finalAmount,
            payment_mode: normalizedPaymentMode,
            payment_channel: config.paymentChannel,
            payment_type: config.paymentType,
            is_under_contract: true,
            subcontract_id: laborer.subcontractId || config.subcontractId || null,
            proof_url: config.proofUrl || null,
            paid_by: config.userName,
            paid_by_user_id: config.userId,
            recorded_by: config.userName,
            recorded_by_user_id: config.userId,
            notes: `Waterfall payment for ${week.weekLabel}${config.notes ? `: ${config.notes}` : ""}`,
            settlement_group_id: settlementGroupId,
            site_engineer_transaction_id: engineerTransactionId,
          },
          config.siteId
        );

        if (paymentError) {
          throw new Error(`Failed to create payment for ${laborer.laborerName}: ${paymentError.message}`);
        }

        paymentIds.push(paymentData.id);
        laborersProcessed++;

        // 6. If salary payment, create week allocation and update attendance
        if (config.paymentType === "salary") {
          await supabase
            .from("payment_week_allocations")
            .insert({
              labor_payment_id: paymentData.id,
              laborer_id: laborer.laborerId,
              site_id: config.siteId,
              week_start: week.weekStart,
              week_end: week.weekEnd,
              allocated_amount: finalAmount,
            });

          // Mark attendance as paid if laborer's week is fully covered
          if (finalAmount >= laborer.balance) {
            await supabase
              .from("daily_attendance")
              .update({
                is_paid: true,
                payment_date: paymentDate,
                payment_id: paymentData.id,
              })
              .eq("site_id", config.siteId)
              .eq("laborer_id", laborer.laborerId)
              .gte("date", week.weekStart)
              .lte("date", week.weekEnd)
              .eq("is_paid", false);
          }
        }

        // 7. If advance payment, update laborer's total_advance_given
        if (config.paymentType === "advance") {
          const { data: laborerData } = await supabase
            .from("laborers")
            .select("total_advance_given")
            .eq("id", laborer.laborerId)
            .single();

          await supabase
            .from("laborers")
            .update({
              total_advance_given: (laborerData?.total_advance_given || 0) + finalAmount,
            })
            .eq("id", laborer.laborerId);
        }
      }

      weekAllocations.push({
        weekLabel: week.weekLabel,
        weekStart: week.weekStart,
        allocated: week.allocatedAmount,
        laborerCount: laborersProcessed,
      });
    }

    // If salary payment with weeks but no labor_payments were created,
    // rollback by cancelling the settlement_group to prevent orphaned records
    if (paymentIds.length === 0 && config.weeks.length > 0 && config.paymentType === "salary") {
      console.error("No labor_payments created despite weeks being provided - cancelling settlement_group", settlementGroupId);
      if (settlementGroupId) {
        await supabase
          .from("settlement_groups")
          .update({
            is_cancelled: true,
            cancelled_at: new Date().toISOString(),
            cancelled_by: config.userName,
            cancelled_by_user_id: config.userId,
            cancellation_reason: "Auto-cancelled: failed to create labor payments for any laborer",
          })
          .eq("id", settlementGroupId);
      }
      return {
        success: false,
        error: "Failed to create labor payments. All laborers may already be fully paid for the selected weeks. Please refresh and try again.",
      };
    }

    return {
      success: true,
      paymentIds,
      weekAllocations,
      settlementReference,
      settlementGroupId,
      engineerTransactionId: engineerTransactionId || undefined,
    };
  } catch (err: any) {
    console.error("Waterfall contract payment error:", err);
    return {
      success: false,
      error: err.message || "Failed to process waterfall contract payment",
    };
  }
}

// ============================================================================
// DATE-WISE CONTRACT SETTLEMENT (NEW - SINGLE SETTLEMENT PER PAYMENT DATE)
// ============================================================================

import type {
  DateWiseSettlementConfig,
  DateWiseSettlementResult,
  WeekAllocationEntry,
  MaestriEarningsResult,
} from "@/types/payment.types";

/**
 * Process a date-wise contract settlement.
 * Creates ONE settlement record per payment date that allocates to multiple weeks (oldest first).
 * This is the new approach where:
 * - Each payment date creates a single SET-* reference
 * - Money flows to oldest unpaid week first (waterfall)
 * - Single settlement can span multiple weeks
 * - Week allocations are stored in settlement_groups.week_allocations JSONB
 */
export async function processDateWiseContractSettlement(
  supabase: SupabaseClient,
  config: DateWiseSettlementConfig
): Promise<DateWiseSettlementResult> {
  try {
    const paymentDate = dayjs().format("YYYY-MM-DD");
    let engineerTransactionId: string | null = null;
    let settlementGroupId: string = "";
    let settlementReference: string = "";
    const laborPaymentIds: string[] = [];
    const weekAllocations: WeekAllocationEntry[] = [];
    let remainingAmount = config.totalAmount;

    // 1. Get all unpaid weeks for contract laborers at this site, ordered oldest first
    const { data: unpaidWeeksData, error: unpaidWeeksError } = await supabase
      .from("daily_attendance")
      .select(`
        id,
        date,
        laborer_id,
        daily_earnings,
        is_paid,
        laborers!inner(id, name, labor_roles(name))
      `)
      .eq("site_id", config.siteId)
      .eq("laborer_type", "contract")
      .eq("is_paid", false)
      .order("date", { ascending: true });

    if (unpaidWeeksError) {
      throw new Error(`Failed to fetch unpaid attendance: ${unpaidWeeksError.message}`);
    }

    if (!unpaidWeeksData || unpaidWeeksData.length === 0) {
      return {
        success: false,
        settlementGroupId: "",
        settlementReference: "",
        totalAmount: 0,
        weekAllocations: [],
        laborPaymentIds: [],
        error: "No unpaid attendance records found for contract laborers",
      };
    }

    // 2. Group attendance by week
    const weekDataMap = new Map<string, {
      weekStart: string;
      weekEnd: string;
      weekLabel: string;
      totalDue: number;
      laborers: Map<string, {
        laborerId: string;
        laborerName: string;
        laborerRole: string | null;
        balance: number;
        attendanceIds: string[];
      }>;
    }>();

    for (const att of unpaidWeeksData) {
      const d = dayjs(att.date);
      const weekStart = d.day(0).format("YYYY-MM-DD"); // Sunday
      const weekEnd = d.day(6).format("YYYY-MM-DD"); // Saturday
      const weekLabel = `${dayjs(weekStart).format("MMM DD")} - ${dayjs(weekEnd).format("MMM DD, YYYY")}`;

      if (!weekDataMap.has(weekStart)) {
        weekDataMap.set(weekStart, {
          weekStart,
          weekEnd,
          weekLabel,
          totalDue: 0,
          laborers: new Map(),
        });
      }

      const week = weekDataMap.get(weekStart)!;
      const laborerData = att.laborers as any;
      const laborerId = att.laborer_id;

      if (!week.laborers.has(laborerId)) {
        week.laborers.set(laborerId, {
          laborerId,
          laborerName: laborerData?.name || "Unknown",
          laborerRole: laborerData?.labor_roles?.name || null,
          balance: 0,
          attendanceIds: [],
        });
      }

      const laborer = week.laborers.get(laborerId)!;
      laborer.balance += att.daily_earnings || 0;
      laborer.attendanceIds.push(att.id);
      week.totalDue += att.daily_earnings || 0;
    }

    // 3. Sort weeks by date (oldest first)
    const sortedWeeks = Array.from(weekDataMap.values()).sort(
      (a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime()
    );

    // 4. Calculate week allocations FIRST (waterfall - oldest first)
    let totalLaborerCount = 0;
    for (const week of sortedWeeks) {
      if (remainingAmount <= 0) break;

      const allocatedAmount = Math.min(remainingAmount, week.totalDue);
      const isFullyPaid = allocatedAmount >= week.totalDue;
      const laborerCount = week.laborers.size;

      if (allocatedAmount > 0) {
        weekAllocations.push({
          weekStart: week.weekStart,
          weekEnd: week.weekEnd,
          weekLabel: week.weekLabel,
          allocatedAmount,
          laborerCount,
          isFullyPaid,
        });
        totalLaborerCount += laborerCount;
        remainingAmount -= allocatedAmount;
      }
    }

    // 5. Create settlement_group using atomic function (guaranteed unique reference)
    const { data: groupResult, error: groupError } = await supabase.rpc(
      "create_settlement_group",
      {
        p_site_id: config.siteId,
        p_settlement_date: config.settlementDate,
        p_total_amount: config.totalAmount,
        p_laborer_count: totalLaborerCount,
        p_payment_channel: config.paymentChannel,
        p_payment_mode: config.paymentMode,
        p_payer_source: config.payerSource,
        p_payer_name: config.payerSource === "custom" || config.payerSource === "other_site_money"
          ? config.customPayerName
          : null,
        p_proof_url: config.proofUrls?.[0] || null,
        p_notes: config.notes || null,
        p_subcontract_id: config.subcontractId || null,
        p_engineer_transaction_id: null,
        p_created_by: config.userId,
        p_created_by_name: config.userName,
        p_payment_type: "salary",
        p_actual_payment_date: config.settlementDate,
        p_settlement_type: "date_wise",
        p_week_allocations: weekAllocations,
        p_proof_urls: config.proofUrls || null,
      }
    );

    if (groupError) {
      console.error("Error creating settlement_group:", groupError);
      throw groupError;
    }

    const groupData = Array.isArray(groupResult) ? groupResult[0] : groupResult;
    if (!groupData || !groupData.id) {
      throw new Error("Failed to create settlement group - no data returned");
    }

    settlementGroupId = groupData.id;
    settlementReference = groupData.settlement_reference;

    // 6. If via engineer wallet, create engineer transaction
    if (config.paymentChannel === "engineer_wallet" && config.engineerId) {
      const { data: txData, error: txError } = await (supabase
        .from("site_engineer_transactions") as any)
        .insert({
          user_id: config.engineerId,
          site_id: config.siteId,
          transaction_type: "received_from_company",
          settlement_status: "pending_settlement",
          amount: config.totalAmount,
          description: `Contract settlement - Rs.${config.totalAmount.toLocaleString()}`,
          payment_mode: config.paymentMode,
          proof_url: config.proofUrls?.[0] || null,
          is_settled: false,
          recorded_by: config.userName,
          recorded_by_user_id: config.userId,
          related_subcontract_id: config.subcontractId || null,
          settlement_group_id: settlementGroupId,
          settlement_reference: settlementReference,
        })
        .select()
        .single();

      if (txError) {
        // Rollback: cancel settlement group
        await supabase
          .from("settlement_groups")
          .update({
            is_cancelled: true,
            cancelled_at: new Date().toISOString(),
            cancelled_by: config.userName,
            cancelled_by_user_id: config.userId,
            cancellation_reason: `Engineer transaction failed: ${txError.message}`,
          })
          .eq("id", settlementGroupId);
        throw txError;
      }

      engineerTransactionId = txData.id;

      // Update settlement_group with engineer_transaction_id
      await supabase
        .from("settlement_groups")
        .update({ engineer_transaction_id: engineerTransactionId })
        .eq("id", settlementGroupId);
    }

    // 7. Create labor_payments and payment_week_allocations for each laborer
    let processedAmount = 0;
    for (const allocation of weekAllocations) {
      const week = weekDataMap.get(allocation.weekStart);
      if (!week) continue;

      // Calculate proportional split within this week
      const weekTotalDue = week.totalDue;

      // Pre-calculate amounts using remainder distribution to avoid rounding loss
      const activeLaborers = Array.from(week.laborers.values()).filter(l => l.balance > 0);
      let allocatedSoFar = 0;
      const laborerAmounts = new Map<string, number>();

      activeLaborers.forEach((laborer, index) => {
        let finalAmount: number;
        if (index === activeLaborers.length - 1) {
          // Last laborer gets the remainder to ensure exact total
          finalAmount = Math.min(allocation.allocatedAmount - allocatedSoFar, laborer.balance);
        } else {
          // Use floor for intermediate laborers to avoid over-allocation
          const proportion = laborer.balance / weekTotalDue;
          finalAmount = Math.min(Math.floor(allocation.allocatedAmount * proportion), laborer.balance);
        }
        laborerAmounts.set(laborer.laborerId, Math.max(0, finalAmount));
        allocatedSoFar += Math.max(0, finalAmount);
      });

      for (const [, laborer] of week.laborers) {
        if (laborer.balance <= 0) continue;

        // Get pre-calculated amount
        const finalAmount = laborerAmounts.get(laborer.laborerId) || 0;

        if (finalAmount <= 0) continue;

        // Idempotency guard: skip if payment already exists for this laborer+settlement+week
        const { data: existingPayment } = await supabase
          .from("labor_payments")
          .select("id")
          .eq("laborer_id", laborer.laborerId)
          .eq("settlement_group_id", settlementGroupId)
          .eq("payment_for_date", week.weekStart)
          .maybeSingle();

        if (existingPayment) {
          laborPaymentIds.push(existingPayment.id);
          processedAmount += finalAmount;
          continue;
        }

        // Create labor_payments record with retry on reference collision
        const { data: paymentData, error: paymentError } = await insertLaborPaymentWithRetry(
          supabase,
          {
            laborer_id: laborer.laborerId,
            site_id: config.siteId,
            payment_date: paymentDate,
            payment_for_date: week.weekStart,
            actual_payment_date: config.settlementDate,
            amount: finalAmount,
            payment_mode: config.paymentMode,
            payment_channel: config.paymentChannel,
            payment_type: "salary",
            is_under_contract: true,
            subcontract_id: config.subcontractId || null,
            proof_url: config.proofUrls?.[0] || null,
            paid_by: config.userName,
            paid_by_user_id: config.userId,
            recorded_by: config.userName,
            recorded_by_user_id: config.userId,
            notes: `Date-wise settlement (${allocation.weekLabel})${config.notes ? `: ${config.notes}` : ""}`,
            settlement_group_id: settlementGroupId,
            site_engineer_transaction_id: engineerTransactionId,
          },
          config.siteId
        );

        if (paymentError) {
          throw new Error(`Failed to create payment for ${laborer.laborerName}: ${paymentError.message}`);
        }

        laborPaymentIds.push(paymentData.id);
        processedAmount += finalAmount;

        // Create payment_week_allocation
        await supabase
          .from("payment_week_allocations")
          .insert({
            labor_payment_id: paymentData.id,
            laborer_id: laborer.laborerId,
            site_id: config.siteId,
            week_start: week.weekStart,
            week_end: week.weekEnd,
            allocated_amount: finalAmount,
          });

        // Mark attendance as paid if laborer's week is fully covered
        if (finalAmount >= laborer.balance) {
          await supabase
            .from("daily_attendance")
            .update({
              is_paid: true,
              payment_date: paymentDate,
              payment_id: paymentData.id,
              settlement_group_id: settlementGroupId,
            })
            .in("id", laborer.attendanceIds);
        }
      }
    }

    return {
      success: true,
      settlementGroupId,
      settlementReference,
      totalAmount: config.totalAmount,
      weekAllocations,
      laborPaymentIds,
    };
  } catch (err: any) {
    console.error("Date-wise contract settlement error:", err);
    return {
      success: false,
      settlementGroupId: "",
      settlementReference: "",
      totalAmount: 0,
      weekAllocations: [],
      laborPaymentIds: [],
      error: err.message || "Failed to process date-wise contract settlement",
    };
  }
}

/**
 * Get date-wise settlements for a week range.
 * Returns settlements grouped by settlement date (not by laborer).
 * @param contractOnly - If true, only returns settlements for contract laborers (has linked labor_payments with is_under_contract=true)
 */
export async function getDateWiseSettlements(
  supabase: SupabaseClient,
  siteId: string,
  weekStart: string,
  weekEnd: string,
  contractOnly: boolean = false
): Promise<{
  settlements: Array<{
    settlementGroupId: string;
    settlementReference: string;
    settlementDate: string;
    totalAmount: number;
    weekAllocations: WeekAllocationEntry[];
    paymentMode: string | null;
    paymentChannel: string;
    payerSource: string | null;
    payerName: string | null;
    proofUrls: string[];
    notes: string | null;
    createdBy: string | null;
    createdAt: string;
    subcontractId: string | null;
  }>;
  total: number;
}> {
  try {
    // If contractOnly, first get settlement_group_ids that have contract labor_payments
    // AND calculate the actual amount from labor_payments (more accurate than settlement_groups.total_amount)
    let contractSettlementAmounts: Map<string, number> | null = null;
    let contractSettlementIds: string[] | null = null;

    if (contractOnly) {
      const { data: contractPayments } = await supabase
        .from("labor_payments")
        .select("settlement_group_id, amount")
        .eq("site_id", siteId)
        .eq("is_under_contract", true)
        .not("settlement_group_id", "is", null);

      if (contractPayments && contractPayments.length > 0) {
        // Group by settlement_group_id and sum amounts
        contractSettlementAmounts = new Map();
        contractPayments.forEach((p: any) => {
          const currentAmount = contractSettlementAmounts!.get(p.settlement_group_id) || 0;
          contractSettlementAmounts!.set(p.settlement_group_id, currentAmount + (p.amount || 0));
        });
        contractSettlementIds = [...contractSettlementAmounts.keys()];
      } else {
        // No contract settlements found
        return { settlements: [], total: 0 };
      }
    }

    // Query settlement_groups that have allocations touching this week range
    let query = (supabase
      .from("settlement_groups") as any)
      .select(`
        id,
        settlement_reference,
        settlement_date,
        total_amount,
        week_allocations,
        payment_mode,
        payment_channel,
        payer_source,
        payer_name,
        proof_url,
        proof_urls,
        notes,
        created_by_name,
        created_at,
        is_cancelled,
        subcontract_id
      `)
      .eq("site_id", siteId)
      .eq("is_cancelled", false)
      // Include settlements with date_wise type OR NULL (for backwards compatibility)
      .or("settlement_type.eq.date_wise,settlement_type.is.null")
      .order("settlement_date", { ascending: false });

    // Filter to only contract settlements if needed
    if (contractOnly && contractSettlementIds) {
      query = query.in("id", contractSettlementIds);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching date-wise settlements:", error);
      return { settlements: [], total: 0 };
    }

    // Filter settlements that have allocations touching the requested week range
    const settlements = (data || [])
      .filter((sg: any) => {
        // If week_allocations exists, use it for filtering
        if (sg.week_allocations && Array.isArray(sg.week_allocations) && sg.week_allocations.length > 0) {
          const allocations = sg.week_allocations as WeekAllocationEntry[];
          return allocations.some(
            (a) => a.weekStart <= weekEnd && a.weekEnd >= weekStart
          );
        }
        // Otherwise, filter by settlement_date falling within week range
        if (sg.settlement_date) {
          return sg.settlement_date >= weekStart && sg.settlement_date <= weekEnd;
        }
        return false;
      })
      .map((sg: any) => ({
        settlementGroupId: sg.id,
        settlementReference: sg.settlement_reference,
        settlementDate: sg.settlement_date,
        // Use calculated amount from labor_payments if available (more accurate than stored total_amount)
        totalAmount: contractSettlementAmounts?.get(sg.id) ?? sg.total_amount,
        weekAllocations: (sg.week_allocations as WeekAllocationEntry[]) || [],
        paymentMode: sg.payment_mode,
        paymentChannel: sg.payment_channel,
        payerSource: sg.payer_source,
        payerName: sg.payer_name,
        proofUrls: sg.proof_urls || (sg.proof_url ? [sg.proof_url] : []),
        notes: sg.notes,
        createdBy: sg.created_by_name,
        createdAt: sg.created_at,
        subcontractId: sg.subcontract_id || null,
      }));

    return { settlements, total: settlements.length };
  } catch (err: any) {
    console.error("Error in getDateWiseSettlements:", err);
    return { settlements: [], total: 0 };
  }
}

// ============================================================================
// MAESTRI EARNINGS CALCULATION
// ============================================================================

/**
 * Calculate Maestri (contractor) earnings based on margin per day.
 * Earnings = maestri_margin_per_day × days_worked × unique_laborers
 */
export async function getMaestriEarnings(
  supabase: SupabaseClient,
  siteId: string,
  subcontractId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<MaestriEarningsResult> {
  try {
    // 1. Get the maestri margin from subcontract
    const { data: subcontract, error: scError } = await supabase
      .from("subcontracts")
      .select("maestri_margin_per_day")
      .eq("id", subcontractId)
      .single();

    if (scError || !subcontract) {
      console.error("Could not fetch subcontract:", scError);
      return {
        totalDaysWorked: 0,
        laborerCount: 0,
        marginPerDay: 0,
        totalMaestriEarnings: 0,
        byWeek: [],
      };
    }

    const marginPerDay = subcontract.maestri_margin_per_day || 0;

    // 2. Build the attendance query
    let query = supabase
      .from("daily_attendance")
      .select("id, date, laborer_id, daily_earnings, attendance_status")
      .eq("site_id", siteId)
      .eq("laborer_type", "contract")
      .neq("attendance_status", "absent");

    // Optional date filters
    if (dateFrom) {
      query = query.gte("date", dateFrom);
    }
    if (dateTo) {
      query = query.lte("date", dateTo);
    }

    const { data: attendanceData, error: attError } = await query;

    if (attError || !attendanceData) {
      console.error("Could not fetch attendance for maestri earnings:", attError);
      return {
        totalDaysWorked: 0,
        laborerCount: 0,
        marginPerDay,
        totalMaestriEarnings: 0,
        byWeek: [],
      };
    }

    // 3. Group by week and count days/laborers
    const weekDataMap = new Map<string, {
      weekStart: string;
      weekEnd: string;
      weekLabel: string;
      daysWorked: number;
      laborerIds: Set<string>;
    }>();

    const allLaborerIds = new Set<string>();
    let totalDaysWorked = 0;

    for (const att of attendanceData) {
      const d = dayjs(att.date);
      const weekStart = d.day(0).format("YYYY-MM-DD");
      const weekEnd = d.day(6).format("YYYY-MM-DD");
      const weekLabel = `${dayjs(weekStart).format("MMM DD")} - ${dayjs(weekEnd).format("MMM DD, YYYY")}`;

      if (!weekDataMap.has(weekStart)) {
        weekDataMap.set(weekStart, {
          weekStart,
          weekEnd,
          weekLabel,
          daysWorked: 0,
          laborerIds: new Set(),
        });
      }

      const week = weekDataMap.get(weekStart)!;
      week.daysWorked += 1;
      week.laborerIds.add(att.laborer_id);
      allLaborerIds.add(att.laborer_id);
      totalDaysWorked += 1;
    }

    // 4. Calculate earnings per week
    const byWeek = Array.from(weekDataMap.values())
      .sort((a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime())
      .map((week) => ({
        weekStart: week.weekStart,
        weekEnd: week.weekEnd,
        weekLabel: week.weekLabel,
        daysWorked: week.daysWorked,
        laborerCount: week.laborerIds.size,
        earnings: week.daysWorked * marginPerDay,
      }));

    // 5. Calculate total earnings
    // Note: totalDaysWorked here is the sum of attendance records (laborer-days)
    // So total earnings = totalDaysWorked * marginPerDay
    const totalMaestriEarnings = totalDaysWorked * marginPerDay;

    return {
      totalDaysWorked,
      laborerCount: allLaborerIds.size,
      marginPerDay,
      totalMaestriEarnings,
      byWeek,
    };
  } catch (err: any) {
    console.error("Error calculating maestri earnings:", err);
    return {
      totalDaysWorked: 0,
      laborerCount: 0,
      marginPerDay: 0,
      totalMaestriEarnings: 0,
      byWeek: [],
    };
  }
}

/**
 * Update the payer_source for a settlement
 * Useful for "System Recovered" payments that need source assignment
 */
export async function updateSettlementPayerSource(
  supabase: SupabaseClient,
  settlementGroupId: string,
  payerSource: string,
  customPayerName?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Update settlement_groups record
    const updateData: Record<string, unknown> = {
      payer_source: payerSource,
      updated_at: new Date().toISOString(),
    };

    // Only set payer_name for custom or other_site_money sources
    if (payerSource === "custom" || payerSource === "other_site_money") {
      updateData.payer_name = customPayerName || null;
    } else {
      updateData.payer_name = null;
    }

    const { error: updateError } = await supabase
      .from("settlement_groups")
      .update(updateData)
      .eq("id", settlementGroupId);

    if (updateError) {
      throw updateError;
    }

    return { success: true };
  } catch (err: any) {
    console.error("Error updating settlement payer source:", err);
    return {
      success: false,
      error: err.message || "Failed to update payer source",
    };
  }
}
