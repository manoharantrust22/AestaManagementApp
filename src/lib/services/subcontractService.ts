import { SupabaseClient } from "@supabase/supabase-js";
import type {
  PayerSourceInput,
  PayerSourceSplitRow,
} from "@/types/settlement.types";
import { validatePayerSourceInput, toRpcArgs } from "@/lib/settlement/payerSource";
import { recordSpend, cancelTransaction } from "./engineerWalletV2";

export interface SubcontractTotals {
  subcontractId: string;
  title: string;
  totalValue: number;
  totalPaid: number;
  balance: number;
  status: string;
  // Breakdown for transparency
  directPayments: number;
  laborPayments: number;
  clearedExpenses: number;
  // Record counts
  directPaymentCount: number;
  laborPaymentCount: number;
  expenseCount: number;
  totalRecordCount: number;
}

interface ViewExpenseRecord {
  contract_id: string;
  amount: number;
  source_type: string;
  expense_type: string;
}

interface SubcontractRecord {
  id: string;
  title: string;
  total_value: number | null;
  status: string;
}

/**
 * Calculate subcontract totals using v_all_expenses for consistency.
 *
 * Uses v_all_expenses view which now includes ALL expense types:
 * - Daily Salary (aggregated by date)
 * - Contract Salary
 * - Advance
 * - Material/Machinery/General expenses
 * - Tea Shop settlements
 * - Miscellaneous expenses
 * - Subcontract direct payments (Direct Payment type)
 *
 * This ensures counts match what's shown in the Daily Expenses page.
 */
export async function calculateSubcontractTotals(
  supabase: SupabaseClient,
  subcontractIds: string[]
): Promise<Map<string, SubcontractTotals>> {
  const results = new Map<string, SubcontractTotals>();

  if (subcontractIds.length === 0) {
    return results;
  }

  // Fetch subcontracts basic info
  const { data: subcontracts, error: scError } = await supabase
    .from("subcontracts")
    .select("id, title, total_value, status")
    .in("id", subcontractIds);

  if (scError || !subcontracts) {
    console.error("Error fetching subcontracts:", scError);
    return results;
  }

  // Fetch ALL cleared expenses from v_all_expenses linked to subcontracts
  // This now includes: Direct Payments, Daily Salary, Contract Salary, Advance, Material, etc.
  const { data: allExpenses } = await (supabase as any)
    .from("v_all_expenses")
    .select("contract_id, amount, source_type, expense_type, is_cleared")
    .in("contract_id", subcontractIds)
    .eq("is_deleted", false)
    .eq("is_cleared", true);

  // Aggregate expenses from v_all_expenses by subcontract
  // Split into: direct payments, labor (settlements), and other (regular expenses)
  const directPaymentMap = new Map<string, { total: number; count: number }>();
  const laborExpenseMap = new Map<string, { total: number; count: number }>();
  const otherExpenseMap = new Map<string, { total: number; count: number }>();

  for (const e of (allExpenses as ViewExpenseRecord[] | null) || []) {
    if (!e.contract_id) continue;

    // Determine category based on source_type
    let targetMap: Map<string, { total: number; count: number }>;
    if (e.source_type === "subcontract_payment") {
      targetMap = directPaymentMap;
    } else if (e.source_type === "settlement" || e.source_type === "tea_shop_settlement") {
      targetMap = laborExpenseMap;
    } else {
      targetMap = otherExpenseMap;
    }

    const current = targetMap.get(e.contract_id) || { total: 0, count: 0 };
    current.total += e.amount || 0;
    current.count += 1;
    targetMap.set(e.contract_id, current);
  }

  // Build results
  for (const sc of subcontracts as SubcontractRecord[]) {
    const direct = directPaymentMap.get(sc.id) || { total: 0, count: 0 };
    const labor = laborExpenseMap.get(sc.id) || { total: 0, count: 0 };
    const other = otherExpenseMap.get(sc.id) || { total: 0, count: 0 };

    const totalPaid = direct.total + labor.total + other.total;
    const totalRecordCount = direct.count + labor.count + other.count;

    results.set(sc.id, {
      subcontractId: sc.id,
      title: sc.title,
      totalValue: sc.total_value || 0,
      totalPaid,
      balance: (sc.total_value || 0) - totalPaid,
      status: sc.status,
      directPayments: direct.total,
      laborPayments: labor.total,
      clearedExpenses: other.total,
      directPaymentCount: direct.count,
      laborPaymentCount: labor.count,
      expenseCount: other.count,
      totalRecordCount,
    });
  }

  return results;
}

/**
 * Get subcontract totals for a site (active/on_hold only by default)
 */
export async function getSiteSubcontractTotals(
  supabase: SupabaseClient,
  siteId: string,
  statusFilter?: string[]
): Promise<SubcontractTotals[]> {
  // Get subcontracts for this site
  let query = supabase
    .from("subcontracts")
    .select("id")
    .eq("site_id", siteId);

  if (statusFilter && statusFilter.length > 0) {
    query = query.in("status", statusFilter);
  } else {
    // Default to active/on_hold
    query = query.in("status", ["active", "on_hold"]);
  }

  const { data: subcontracts, error } = await query;

  if (error || !subcontracts) {
    console.error("Error fetching site subcontracts:", error);
    return [];
  }

  const ids = subcontracts.map((s: { id: string }) => s.id);
  const totalsMap = await calculateSubcontractTotals(supabase, ids);
  return Array.from(totalsMap.values());
}

/**
 * Get all subcontract totals (company-wide)
 */
export async function getAllSubcontractTotals(
  supabase: SupabaseClient,
  statusFilter?: string[]
): Promise<SubcontractTotals[]> {
  let query = supabase.from("subcontracts").select("id");

  if (statusFilter && statusFilter.length > 0) {
    query = query.in("status", statusFilter);
  }

  const { data: subcontracts, error } = await query;

  if (error || !subcontracts) {
    console.error("Error fetching all subcontracts:", error);
    return [];
  }

  const ids = subcontracts.map((s: { id: string }) => s.id);
  const totalsMap = await calculateSubcontractTotals(supabase, ids);
  return Array.from(totalsMap.values());
}

// ---------------------------------------------------------------------------
// Record a subcontract payment (Phase 2: parity with Task Work / settlements)
// ---------------------------------------------------------------------------

export type SubcontractPaymentChannel = "direct" | "engineer_wallet";

export interface RecordSubcontractPaymentConfig {
  contractId: string;
  siteId: string;
  contractTitle: string;
  paymentType: string; // contract_payment_type
  amount: number;
  paymentDate: string;
  paymentMode: "cash" | "upi" | "bank_transfer" | "cheque" | "other";
  paymentChannel: SubcontractPaymentChannel;
  /** Required for the `direct` channel — whose money paid this. */
  payer?: PayerSourceInput | null;
  /** Required for the `engineer_wallet` channel — which engineer paid. */
  engineerId?: string | null;
  /** Screenshot/receipt proof (esp. for UPI). */
  proofUrl?: string | null;
  notes?: string | null;
  balanceAfterPayment?: number | null;
  userId: string;
  userName: string;
}

export interface RecordSubcontractPaymentResult {
  success: boolean;
  id?: string;
  engineerTransactionId?: string;
  error?: string;
}

/**
 * Record a weekly-advance / part-payment / milestone / final-settlement against a
 * subcontract. Mirrors taskWorkService.createTaskWorkPayment:
 *
 *  - Validates the payer source BEFORE any wallet debit (direct channel).
 *  - engineer_wallet channel debits the wallet FIRST (atomic RPC, WLT01 on
 *    insufficient balance); on a later insert failure the orphan spend is
 *    soft-cancelled so the ledger never shows a phantom debit.
 *  - Stores the wallet txn id in `site_engineer_transaction_id` (subcontract_payments'
 *    existing column). Direct payments keep payer_source / payer_name / payer_source_split.
 */
export async function recordSubcontractPayment(
  supabase: SupabaseClient,
  config: RecordSubcontractPaymentConfig
): Promise<RecordSubcontractPaymentResult> {
  let engineerTransactionId: string | null = null;
  try {
    if (!(config.amount > 0)) {
      return { success: false, error: "Amount must be greater than zero." };
    }

    // Validate payer source for the direct channel up front.
    let payerRpc: ReturnType<typeof toRpcArgs> | null = null;
    if (config.paymentChannel === "direct") {
      if (!config.payer) {
        return { success: false, error: "Choose the payment source." };
      }
      const check = validatePayerSourceInput(config.payer, config.amount);
      if (!check.ok) {
        return { success: false, error: `Invalid payment source: ${check.reason}` };
      }
      payerRpc = toRpcArgs(config.payer);
    }

    // Engineer-wallet channel: debit the wallet first (cheque not supported by
    // the wallet ledger — coerce to cash).
    if (config.paymentChannel === "engineer_wallet") {
      if (!config.engineerId) {
        return {
          success: false,
          error: "Select which engineer paid from their wallet.",
        };
      }
      const walletMode =
        config.paymentMode === "upi"
          ? "upi"
          : config.paymentMode === "bank_transfer"
          ? "bank_transfer"
          : "cash";
      const spend = await recordSpend(supabase, {
        engineer_id: config.engineerId,
        site_id: config.siteId,
        amount: config.amount,
        transaction_date: config.paymentDate,
        payment_mode: walletMode,
        proof_url: config.proofUrl ?? null,
        notes: config.notes ?? null,
        recorded_by: config.userName,
        recorded_by_user_id: config.userId,
        description: `Contract ${config.contractTitle} (${config.paymentType.replace(
          /_/g,
          " "
        )})`,
      });
      engineerTransactionId = spend.id;
    }

    const row = {
      // Column is contract_id (NOT subcontract_id) on subcontract_payments.
      contract_id: config.contractId,
      payment_type: config.paymentType,
      amount: config.amount,
      payment_date: config.paymentDate,
      payment_mode: config.paymentMode,
      payment_channel: config.paymentChannel,
      payer_source: engineerTransactionId ? null : payerRpc?.p_payer_source ?? null,
      payer_name: engineerTransactionId ? null : payerRpc?.p_payer_name ?? null,
      payer_source_split: engineerTransactionId
        ? null
        : (payerRpc?.p_payer_source_split as PayerSourceSplitRow[] | null) ?? null,
      site_engineer_transaction_id: engineerTransactionId,
      receipt_url: config.proofUrl ?? null,
      balance_after_payment: config.balanceAfterPayment ?? null,
      // Column is comments (NOT notes) on subcontract_payments.
      comments: config.notes ?? null,
      paid_by: config.userId,
      paid_by_user_id: config.userId,
      recorded_by: config.userName,
      recorded_by_user_id: config.userId,
    };

    const { data, error } = await (
      supabase.from("subcontract_payments") as any
    )
      .insert(row)
      .select("id")
      .single();

    if (error) {
      // Insert failed after a possible wallet debit — soft-cancel the spend so we
      // don't strand a phantom debit (cancelTransaction, not reverse_*, because the
      // spend has no linked allocation yet).
      if (engineerTransactionId) {
        try {
          await cancelTransaction(supabase, {
            id: engineerTransactionId,
            reason: "Auto-reversed: subcontract payment insert failed",
            cancelled_by: config.userName,
            cancelled_by_user_id: config.userId,
          });
        } catch (reverseErr) {
          console.error(
            "Failed to cancel orphan wallet spend after subcontract payment insert failure:",
            reverseErr
          );
        }
      }
      throw error;
    }

    return {
      success: true,
      id: data?.id,
      engineerTransactionId: engineerTransactionId || undefined,
    };
  } catch (error: any) {
    console.error("Error recording subcontract payment:", error);
    return {
      success: false,
      error: error?.message || "Failed to record the payment.",
    };
  }
}
