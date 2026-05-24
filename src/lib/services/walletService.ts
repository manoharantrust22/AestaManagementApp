/**
 * Engineer Wallet Service
 * Handles all wallet operations including deposits, expenses, returns, and reimbursements
 */

import { SupabaseClient } from "@supabase/supabase-js";
import dayjs from "dayjs";
import type {
  BatchOption,
  BatchAllocation,
  BatchValidationResult,
  EngineerWalletSummary,
  PendingReimbursement,
  RecordDepositConfig,
  RecordSpendingConfig,
  RecordReturnConfig,
  SettleReimbursementConfig,
  WalletOperationResult,
  SourceBreakdown,
  SiteBreakdown,
} from "@/types/wallet.types";
import type { PayerSource } from "@/types/settlement.types";
import { recordSpend as recordSpendV2 } from "./engineerWalletV2";
import type { WalletPaymentMode } from "@/types/engineer-wallet-v2.types";

// ============================================
// Batch Code Generation
// ============================================

/**
 * Generate a unique batch code for a deposit
 * Calls the database function generate_batch_code(payer_source)
 */
export async function generateBatchCode(
  supabase: SupabaseClient,
  payerSource: PayerSource
): Promise<string> {
  const { data, error } = await supabase.rpc("generate_batch_code", {
    p_payer_source: payerSource,
  });

  if (error) {
    console.error("Error generating batch code:", error);
    // Fallback: generate client-side
    const prefix = getPayerSourcePrefix(payerSource);
    const month = dayjs().format("YYMMDD");
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
    return `${prefix}-${month}-${random}`;
  }

  return data as string;
}

/** Get prefix for payer source */
function getPayerSourcePrefix(source: PayerSource): string {
  const prefixes: Record<PayerSource, string> = {
    trust_account: "TRUST",
    amma_money: "AMMA",
    mothers_money: "AMMA",
    client_money: "CLIENT",
    own_money: "OWN",
    other_site_money: "SITE",
    custom: "OTHER",
  };
  return prefixes[source] || "MISC";
}

// ============================================
// Batch Queries
// ============================================

/**
 * Get available batches for an engineer
 * Returns batches with remaining_balance > 0
 * Optionally filters by site for site-restricted batches
 */
export async function getAvailableBatches(
  supabase: SupabaseClient,
  engineerId: string,
  siteId?: string | null
): Promise<BatchOption[]> {
  let query = supabase
    .from("site_engineer_transactions")
    .select(`
      id,
      batch_code,
      payer_source,
      payer_name,
      remaining_balance,
      amount,
      site_id,
      site_restricted,
      created_at,
      transaction_date,
      sites!site_engineer_transactions_site_id_fkey(name)
    `)
    .eq("user_id", engineerId)
    .eq("transaction_type", "received_from_company")
    .gt("remaining_balance", 0)
    .order("created_at", { ascending: true });

  // Performance optimization: Move site restriction filter to SQL instead of JavaScript
  // Filter: NOT (site_restricted AND siteId exists AND site_id != siteId)
  // Equivalent to: site_restricted = false OR site_id = siteId OR siteId is not provided
  if (siteId) {
    // If site is specified, only include batches that are either:
    // 1. Not site-restricted (can be used anywhere)
    // 2. Restricted to the current site
    query = query.or(`site_restricted.eq.false,site_id.eq.${siteId}`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching available batches:", error);
    return [];
  }

  // Map results (filter moved to SQL above)
  const batches: BatchOption[] = (data || []).map((row: any) => ({
      id: row.id,
      batch_code: row.batch_code || `LEGACY-${row.id.slice(0, 8)}`,
      payer_source: row.payer_source || "own_money",
      payer_name: row.payer_name,
      remaining_balance: Number(row.remaining_balance) || 0,
      original_amount: Number(row.amount) || 0,
      site_id: row.site_id,
      site_name: row.sites?.name || null,
      site_restricted: row.site_restricted || false,
      created_at: row.created_at,
      transaction_date: row.transaction_date,
    }));

  return batches;
}

/**
 * Get total available balance for an engineer
 */
export async function getAvailableBalance(
  supabase: SupabaseClient,
  engineerId: string,
  siteId?: string | null
): Promise<number> {
  const batches = await getAvailableBatches(supabase, engineerId, siteId);
  return batches.reduce((sum, b) => sum + b.remaining_balance, 0);
}

// ============================================
// Validation
// ============================================

/**
 * Validate batch selection for spending or returning
 */
export function validateBatchSelection(
  availableBatches: BatchOption[],
  selectedAllocations: BatchAllocation[],
  requiredAmount: number,
  targetSiteId: string | null
): BatchValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if any batches are selected
  if (selectedAllocations.length === 0) {
    errors.push("Please select at least one batch to use");
    return { valid: false, errors, warnings };
  }

  // Calculate total selected
  const totalSelected = selectedAllocations.reduce((sum, a) => sum + a.amount, 0);

  // Check if total matches required amount
  if (Math.abs(totalSelected - requiredAmount) > 0.01) {
    if (totalSelected < requiredAmount) {
      errors.push(`Selected amount (₹${totalSelected.toLocaleString()}) is less than required (₹${requiredAmount.toLocaleString()})`);
    } else {
      errors.push(`Selected amount (₹${totalSelected.toLocaleString()}) exceeds required (₹${requiredAmount.toLocaleString()})`);
    }
  }

  // Validate each allocation
  for (const allocation of selectedAllocations) {
    const batch = availableBatches.find((b) => b.id === allocation.batchId);

    if (!batch) {
      errors.push(`Batch ${allocation.batchCode} not found`);
      continue;
    }

    // Check if amount exceeds remaining balance
    if (allocation.amount > batch.remaining_balance) {
      errors.push(
        `Cannot use ₹${allocation.amount.toLocaleString()} from batch ${allocation.batchCode}. Only ₹${batch.remaining_balance.toLocaleString()} available.`
      );
    }

    // Check site restriction
    if (batch.site_restricted && targetSiteId && batch.site_id !== targetSiteId) {
      errors.push(
        `Batch ${allocation.batchCode} is restricted to site "${batch.site_name}" and cannot be used for this site.`
      );
    }

    // Warning for using site-restricted batch
    if (batch.site_restricted && !targetSiteId) {
      warnings.push(
        `Batch ${allocation.batchCode} is restricted to site "${batch.site_name}".`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================
// Deposit Operations
// ============================================

/**
 * Record a deposit (Add Money to Wallet)
 *
 * TODO(payer-split-followup): migrate to PayerSourceInput. This is the legacy
 * v1 batch-tracking deposit (writes batch_code / remaining_balance / etc.) and
 * has no live callers in the app today — all live wallet deposits go through
 * `engineerWalletV2.recordDeposit`. Leaving here unchanged so its legacy
 * `config.payerSource` / `config.payerName` shape keeps compiling until the
 * function itself is either removed or rewritten.
 */
export async function recordDeposit(
  supabase: SupabaseClient,
  config: RecordDepositConfig
): Promise<WalletOperationResult> {
  try {
    // Generate batch code
    const batchCode = await generateBatchCode(supabase, config.payerSource);

    // Create transaction
    const { data, error } = await (supabase
      .from("site_engineer_transactions") as any)
      .insert({
        user_id: config.engineerId,
        transaction_type: "received_from_company",
        amount: config.amount,
        transaction_date: config.transactionDate || dayjs().format("YYYY-MM-DD"),
        payment_mode: config.paymentMode,
        proof_url: config.proofUrl || null,
        site_id: config.siteId || null,
        site_restricted: config.siteRestricted || false,
        related_subcontract_id: config.subcontractId || null,
        description: config.notes || null,
        notes: config.notes || null,
        recorded_by: config.userName,
        recorded_by_user_id: config.userId,
        is_settled: false,
        settlement_status: "pending_settlement",
        // New batch tracking fields
        payer_source: config.payerSource,
        payer_name: config.payerName || null,
        batch_code: batchCode,
        remaining_balance: config.amount, // Full amount available initially
      })
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      transactionId: data.id,
      batchCode: batchCode,
    };
  } catch (err: any) {
    console.error("Error recording deposit:", err);
    return {
      success: false,
      error: err.message || "Failed to record deposit",
    };
  }
}

// ============================================
// Spending Operations
// ============================================

/**
 * Record spending from wallet
 */
export async function recordWalletSpending(
  supabase: SupabaseClient,
  config: RecordSpendingConfig
): Promise<WalletOperationResult> {
  // v2 SHIM (2026-05-09): the per-batch ledger model is gone. site_engineer_transactions
  // no longer has batch_code / remaining_balance / settlement_group_id columns, and
  // engineer_wallet_batch_usage was dropped. We forward to atomic_record_wallet_spend
  // (engineerWalletV2.recordSpend), which holds a per-(engineer, site) advisory lock and
  // accepts any positive amount — a deficit becomes "office owes engineer" and is cleared
  // by a subsequent deposit on the same site. config.batchAllocations is intentionally
  // ignored here so existing callers in settlementService keep compiling unchanged.
  try {
    // PaymentMode includes "cheque" | "other" which the wallet RPC doesn't accept;
    // map them to bank_transfer (closest equivalent for ledger purposes).
    const walletPaymentMode: WalletPaymentMode =
      config.paymentMode === "cash" ||
      config.paymentMode === "upi" ||
      config.paymentMode === "bank_transfer"
        ? config.paymentMode
        : "bank_transfer";
    const result = await recordSpendV2(supabase, {
      engineer_id: config.engineerId,
      site_id: config.siteId,
      amount: config.amount,
      payment_mode: walletPaymentMode,
      proof_url: config.proofUrl ?? null,
      transaction_date: config.transactionDate,
      description: config.description,
      notes: config.notes ?? null,
      recorded_by: config.userName,
      recorded_by_user_id: config.userId,
    });
    return { success: true, transactionId: result.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to record spending";
    console.error("Error recording wallet spending:", err);
    return { success: false, error: message };
  }
}

/**
 * Record spending using own money (creates pending reimbursement)
 */
export async function recordOwnMoneySpending(
  supabase: SupabaseClient,
  config: RecordSpendingConfig
): Promise<WalletOperationResult> {
  try {
    // Create spending transaction with own money type
    const { data: txData, error: txError } = await (supabase
      .from("site_engineer_transactions") as any)
      .insert({
        user_id: config.engineerId,
        transaction_type: "used_own_money",
        amount: config.amount,
        transaction_date: config.transactionDate || dayjs().format("YYYY-MM-DD"),
        payment_mode: config.paymentMode,
        site_id: config.siteId,
        description: config.description,
        notes: config.notes || null,
        recipient_type: config.recipientType || null,
        related_subcontract_id: config.subcontractId || null,
        proof_url: config.proofUrl || null,
        recorded_by: config.userName,
        recorded_by_user_id: config.userId,
        is_settled: false, // Pending reimbursement
      })
      .select()
      .single();

    if (txError) throw txError;

    // The pending reimbursement is implicit - is_settled = false on used_own_money transactions
    // means it's pending reimbursement

    return {
      success: true,
      transactionId: txData.id,
    };
  } catch (err: any) {
    console.error("Error recording own money spending:", err);
    return {
      success: false,
      error: err.message || "Failed to record spending",
    };
  }
}

// ============================================
// Return Operations
// ============================================

/**
 * Record money returned to company
 */
export async function recordReturn(
  supabase: SupabaseClient,
  config: RecordReturnConfig
): Promise<WalletOperationResult> {
  try {
    if (!config.batchAllocations || config.batchAllocations.length === 0) {
      return { success: false, error: "No batch allocations provided" };
    }

    // Validate allocations
    const batches = await getAvailableBatches(supabase, config.engineerId);
    const validation = validateBatchSelection(
      batches,
      config.batchAllocations,
      config.amount,
      null
    );

    if (!validation.valid) {
      return { success: false, error: validation.errors.join("; ") };
    }

    // Create return transaction
    const { data: txData, error: txError } = await (supabase
      .from("site_engineer_transactions") as any)
      .insert({
        user_id: config.engineerId,
        transaction_type: "returned_to_company",
        amount: config.amount,
        transaction_date: config.transactionDate || dayjs().format("YYYY-MM-DD"),
        payment_mode: config.paymentMode,
        notes: config.notes || null,
        recorded_by: config.userName,
        recorded_by_user_id: config.userId,
        is_settled: true,
      })
      .select()
      .single();

    if (txError) throw txError;

    // Batch insert usage records and update balances in parallel
    // 1. Prepare all usage records for batch insert
    const usageRecords = config.batchAllocations.map((allocation) => ({
      transaction_id: txData.id,
      batch_transaction_id: allocation.batchId,
      amount_used: allocation.amount,
    }));

    // 2. Prepare all balance updates
    const balanceUpdates = config.batchAllocations
      .map((allocation) => {
        const batch = batches.find((b) => b.id === allocation.batchId);
        if (!batch) return null;
        return {
          id: allocation.batchId,
          remaining_balance: batch.remaining_balance - allocation.amount,
        };
      })
      .filter(Boolean) as { id: string; remaining_balance: number }[];

    // 3. Execute both operations in parallel
    const [usageResult, balanceResult] = await Promise.all([
      // Batch insert usage records
      (supabase.from("engineer_wallet_batch_usage") as any).insert(usageRecords),
      // Batch update balances using upsert
      supabase
        .from("site_engineer_transactions")
        .upsert(balanceUpdates, { onConflict: "id" }),
    ]);

    if (usageResult.error) {
      console.error("Error creating batch usage records:", usageResult.error);
    }

    if (balanceResult.error) {
      console.error("Error updating batch balances:", balanceResult.error);
    }

    return {
      success: true,
      transactionId: txData.id,
    };
  } catch (err: any) {
    console.error("Error recording return:", err);
    return {
      success: false,
      error: err.message || "Failed to record return",
    };
  }
}

// ============================================
// Reimbursement Operations
// ============================================

/**
 * Get pending reimbursements for an engineer
 */
export async function getPendingReimbursements(
  supabase: SupabaseClient,
  engineerId?: string
): Promise<PendingReimbursement[]> {
  let query = supabase
    .from("site_engineer_transactions")
    .select(`
      id,
      user_id,
      amount,
      description,
      site_id,
      transaction_date,
      created_at,
      users!site_engineer_transactions_user_id_fkey(name),
      sites!site_engineer_transactions_site_id_fkey(name)
    `)
    .eq("transaction_type", "used_own_money")
    .eq("is_settled", false)
    .order("transaction_date", { ascending: false });

  if (engineerId) {
    query = query.eq("user_id", engineerId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching pending reimbursements:", error);
    return [];
  }

  return (data || []).map((row: any) => ({
    transaction_id: row.id,
    engineer_id: row.user_id,
    engineer_name: row.users?.name || "Unknown",
    amount: Number(row.amount) || 0,
    description: row.description,
    site_id: row.site_id,
    site_name: row.sites?.name || null,
    transaction_date: row.transaction_date,
    created_at: row.created_at,
  }));
}

/**
 * Settle reimbursement(s) for an engineer's own money expenses
 * OPTIMIZED: Uses batch insert and batch update instead of N+1 queries
 */
export async function settleReimbursement(
  supabase: SupabaseClient,
  config: SettleReimbursementConfig
): Promise<WalletOperationResult> {
  try {
    const amountPerExpense = config.totalAmount / config.expenseTransactionIds.length;
    const settledDate = config.settledDate || dayjs().format("YYYY-MM-DD");

    // OPTIMIZED: Batch create all reimbursement records in single insert
    const reimbursementRecords = config.expenseTransactionIds.map((expenseId) => ({
      expense_transaction_id: expenseId,
      engineer_id: config.engineerId,
      amount: amountPerExpense,
      payer_source: config.payerSource,
      payer_name: config.payerName || null,
      payment_mode: config.paymentMode,
      proof_url: config.proofUrl || null,
      settled_date: settledDate,
      settled_by_user_id: config.userId,
      settled_by_name: config.userName,
      notes: config.notes || null,
    }));

    // OPTIMIZED: Execute batch insert and batch update in parallel
    const [reimbResult, updateResult] = await Promise.all([
      // Batch insert all reimbursement records
      (supabase.from("engineer_reimbursements") as any).insert(reimbursementRecords),
      // Batch update all transactions to is_settled=true
      supabase
        .from("site_engineer_transactions")
        .update({ is_settled: true })
        .in("id", config.expenseTransactionIds),
    ]);

    if (reimbResult.error) {
      console.error("Error creating reimbursement records:", reimbResult.error);
    }

    if (updateResult.error) {
      console.error("Error updating transaction settled status:", updateResult.error);
    }

    return { success: true };
  } catch (err: any) {
    console.error("Error settling reimbursement:", err);
    return {
      success: false,
      error: err.message || "Failed to settle reimbursement",
    };
  }
}

// ============================================
// Wallet Summary
// ============================================

/**
 * Get engineer wallet summary with two-balance display
 */
export async function getEngineerWalletSummary(
  supabase: SupabaseClient,
  engineerId: string
): Promise<EngineerWalletSummary | null> {
  try {
    // Get engineer info
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("name")
      .eq("id", engineerId)
      .single();

    if (userError) throw userError;

    // Get all transactions for this engineer
    const { data: transactions, error: txError } = await supabase
      .from("site_engineer_transactions")
      .select(`
        id,
        transaction_type,
        amount,
        payer_source,
        payer_name,
        batch_code,
        site_id,
        site_restricted,
        remaining_balance,
        is_settled,
        sites!site_engineer_transactions_site_id_fkey(name)
      `)
      .eq("user_id", engineerId)
      .is("cancelled_at", null);

    if (txError) throw txError;

    // Get reimbursements
    const { data: reimbursements, error: reimbError } = await supabase
      .from("engineer_reimbursements")
      .select("amount")
      .eq("engineer_id", engineerId);

    if (reimbError) {
      console.error("Error fetching reimbursements:", reimbError);
    }

    // Calculate totals
    let totalReceived = 0;
    let totalSpentFromWallet = 0;
    let totalReturned = 0;
    let totalOwnMoneyUsed = 0;
    const totalReimbursed = (reimbursements || []).reduce((sum, r) => sum + Number(r.amount), 0);

    const availableBatches: BatchOption[] = [];
    const bySource: Map<PayerSource, SourceBreakdown> = new Map();
    const bySite: Map<string, SiteBreakdown> = new Map();

    for (const tx of transactions || []) {
      const amount = Number(tx.amount) || 0;
      const type = tx.transaction_type;
      const source = (tx.payer_source || "own_money") as PayerSource;

      switch (type) {
        case "received_from_company":
          totalReceived += amount;

          // Track by source
          if (!bySource.has(source)) {
            bySource.set(source, {
              source,
              source_label: getSourceLabel(source),
              total_received: 0,
              total_spent: 0,
              remaining: 0,
            });
          }
          const srcBreakdown = bySource.get(source)!;
          srcBreakdown.total_received += amount;
          srcBreakdown.remaining += Number(tx.remaining_balance) || 0;

          // Add to available batches if has remaining balance
          if (Number(tx.remaining_balance) > 0) {
            availableBatches.push({
              id: tx.id,
              batch_code: tx.batch_code || `LEGACY-${tx.id.slice(0, 8)}`,
              payer_source: source,
              payer_name: tx.payer_name,
              remaining_balance: Number(tx.remaining_balance),
              original_amount: amount,
              site_id: tx.site_id,
              site_name: (tx as any).sites?.name || null,
              site_restricted: tx.site_restricted || false,
              created_at: "",
              transaction_date: "",
            });
          }
          break;

        case "spent_on_behalf":
          totalSpentFromWallet += amount;

          // Track by site
          if (tx.site_id) {
            if (!bySite.has(tx.site_id)) {
              bySite.set(tx.site_id, {
                site_id: tx.site_id,
                site_name: (tx as any).sites?.name || "Unknown",
                spent: 0,
                own_money: 0,
              });
            }
            bySite.get(tx.site_id)!.spent += amount;
          }
          break;

        case "used_own_money":
          totalOwnMoneyUsed += amount;

          // Track by site
          if (tx.site_id) {
            if (!bySite.has(tx.site_id)) {
              bySite.set(tx.site_id, {
                site_id: tx.site_id,
                site_name: (tx as any).sites?.name || "Unknown",
                spent: 0,
                own_money: 0,
              });
            }
            bySite.get(tx.site_id)!.own_money += amount;
          }
          break;

        case "returned_to_company":
          totalReturned += amount;
          break;
      }
    }

    // Calculate two-balance display
    const walletBalance = totalReceived - totalSpentFromWallet - totalReturned;
    const owedToEngineer = totalOwnMoneyUsed - totalReimbursed;

    // Get pending reimbursements
    const pendingReimbursements = await getPendingReimbursements(supabase, engineerId);

    return {
      engineer_id: engineerId,
      engineer_name: userData.name,
      wallet_balance: Math.max(0, walletBalance),
      owed_to_engineer: Math.max(0, owedToEngineer),
      total_received: totalReceived,
      total_spent_from_wallet: totalSpentFromWallet,
      total_returned: totalReturned,
      total_own_money_used: totalOwnMoneyUsed,
      total_reimbursed: totalReimbursed,
      available_batches: availableBatches,
      pending_reimbursements: pendingReimbursements,
      by_source: Array.from(bySource.values()),
      by_site: Array.from(bySite.values()),
    };
  } catch (err) {
    console.error("Error getting wallet summary:", err);
    return null;
  }
}

function getSourceLabel(source: PayerSource): string {
  const labels: Record<PayerSource, string> = {
    trust_account: "Trust Account",
    amma_money: "Amma Money",
    mothers_money: "Amma Money",
    client_money: "Client Money",
    own_money: "Own Money",
    other_site_money: "Other Site",
    custom: "Other",
  };
  return labels[source] || source;
}

// ============================================
// Company Overview
// ============================================

/**
 * Get company-wide wallet overview
 */
export async function getCompanyWalletOverview(
  supabase: SupabaseClient
): Promise<{
  totalGiven: number;
  totalSpent: number;
  totalOwnMoney: number;
  totalReturned: number;
  totalWithEngineers: number;
  totalOwedToEngineers: number;
}> {
  // Get all transactions
  const { data: transactions, error } = await supabase
    .from("site_engineer_transactions")
    .select("user_id, transaction_type, amount, is_settled")
    .is("cancelled_at", null);

  if (error) {
    console.error("Error fetching company overview:", error);
    return {
      totalGiven: 0,
      totalSpent: 0,
      totalOwnMoney: 0,
      totalReturned: 0,
      totalWithEngineers: 0,
      totalOwedToEngineers: 0,
    };
  }

  // Get reimbursements
  const { data: reimbursements } = await supabase
    .from("engineer_reimbursements")
    .select("amount, engineer_id");

  // Calculate per-engineer balances
  const engineerBalances: Map<string, { balance: number; owed: number }> = new Map();

  for (const tx of transactions || []) {
    const amount = Number(tx.amount) || 0;
    const engId = tx.user_id;

    if (!engineerBalances.has(engId)) {
      engineerBalances.set(engId, { balance: 0, owed: 0 });
    }
    const bal = engineerBalances.get(engId)!;

    switch (tx.transaction_type) {
      case "received_from_company":
        bal.balance += amount;
        break;
      case "spent_on_behalf":
        bal.balance -= amount;
        break;
      case "used_own_money":
        if (!tx.is_settled) {
          bal.owed += amount;
        }
        break;
      case "returned_to_company":
        bal.balance -= amount;
        break;
    }
  }

  // Subtract reimbursements from owed
  for (const reimb of reimbursements || []) {
    const engId = reimb.engineer_id;
    if (engineerBalances.has(engId)) {
      engineerBalances.get(engId)!.owed -= Number(reimb.amount) || 0;
    }
  }

  // Calculate totals
  let totalGiven = 0;
  let totalSpent = 0;
  let totalOwnMoney = 0;
  let totalReturned = 0;
  let totalWithEngineers = 0;
  let totalOwedToEngineers = 0;

  for (const tx of transactions || []) {
    const amount = Number(tx.amount) || 0;
    switch (tx.transaction_type) {
      case "received_from_company":
        totalGiven += amount;
        break;
      case "spent_on_behalf":
        totalSpent += amount;
        break;
      case "used_own_money":
        totalOwnMoney += amount;
        break;
      case "returned_to_company":
        totalReturned += amount;
        break;
    }
  }

  // Sum positive balances
  for (const [, bal] of engineerBalances) {
    if (bal.balance > 0) totalWithEngineers += bal.balance;
    if (bal.owed > 0) totalOwedToEngineers += bal.owed;
  }

  return {
    totalGiven,
    totalSpent,
    totalOwnMoney,
    totalReturned,
    totalWithEngineers,
    totalOwedToEngineers,
  };
}
