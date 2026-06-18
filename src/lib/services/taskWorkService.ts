import { SupabaseClient } from "@supabase/supabase-js";
import type {
  PayerSourceInput,
  PayerSourceSplitRow,
} from "@/types/settlement.types";
import { validatePayerSourceInput, toRpcArgs } from "@/lib/settlement/payerSource";
import { recordSpend, cancelTransaction } from "./engineerWalletV2";
import type {
  TaskWorkPaymentChannel,
  TaskWorkPaymentMode,
  TaskWorkPaymentType,
} from "@/types/taskWork.types";

export interface CreateTaskWorkPaymentConfig {
  packageId: string;
  siteId: string;
  packageNumber: string;
  packageTitle: string;
  paymentType: TaskWorkPaymentType;
  amount: number;
  paymentDate: string;
  paymentMode: TaskWorkPaymentMode;
  paymentChannel: TaskWorkPaymentChannel;
  /** Required for the `direct` channel — whose money paid this. */
  payer?: PayerSourceInput | null;
  /** Required for the `engineer_wallet` channel — which engineer paid. */
  engineerId?: string | null;
  balanceAfterPayment?: number | null;
  proofUrl?: string | null;
  notes?: string | null;
  userId: string;
  userName: string;
}

export interface TaskWorkPaymentResult {
  success: boolean;
  id?: string;
  engineerTransactionId?: string;
  error?: string;
}

/**
 * Record an advance / part-payment / final settlement / retention release for a
 * task-work package. Mirrors miscExpenseService.createMiscExpense:
 *
 *  - Validates the payer source BEFORE any wallet debit.
 *  - For the engineer-wallet channel, records the wallet spend FIRST, then
 *    inserts the payment row; if the insert fails, the orphan spend is
 *    soft-cancelled so the ledger never shows a phantom debit.
 *  - Stamps the wallet transaction with related_task_work_id + settlement_reference.
 */
export async function createTaskWorkPayment(
  supabase: SupabaseClient,
  config: CreateTaskWorkPaymentConfig
): Promise<TaskWorkPaymentResult> {
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

    // Engineer-wallet channel: debit the wallet first (atomic RPC, WLT01 on
    // insufficient balance). The ledger only models cash/upi/bank_transfer.
    if (config.paymentChannel === "engineer_wallet") {
      if (!config.engineerId) {
        return { success: false, error: "Select which engineer paid from their wallet." };
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
        description: `Task work ${config.packageNumber} (${config.paymentType.replace(
          "_",
          " "
        )}) - ${config.packageTitle}`,
      });
      engineerTransactionId = spend.id;
    }

    const row = {
      package_id: config.packageId,
      site_id: config.siteId,
      payment_type: config.paymentType,
      amount: config.amount,
      payment_date: config.paymentDate,
      payment_mode: config.paymentMode,
      payment_channel: config.paymentChannel,
      // Wallet spends derive their source from how the wallet was funded, so we
      // store NULL; direct payments keep the manually chosen source.
      payer_source: engineerTransactionId ? null : payerRpc?.p_payer_source ?? null,
      payer_name: engineerTransactionId ? null : payerRpc?.p_payer_name ?? null,
      payer_source_split: engineerTransactionId
        ? null
        : (payerRpc?.p_payer_source_split as PayerSourceSplitRow[] | null) ?? null,
      engineer_transaction_id: engineerTransactionId,
      balance_after_payment: config.balanceAfterPayment ?? null,
      reference_number: config.packageNumber,
      proof_url: config.proofUrl ?? null,
      created_by: config.userId,
      created_by_name: config.userName,
    };

    const { data, error } = await (
      supabase.from("task_work_payments" as any) as any
    )
      .insert(row)
      .select()
      .single();

    if (error) {
      // The insert failed after a possible wallet debit — soft-cancel the spend
      // so we don't strand a phantom debit (cancelTransaction, not reverse_*,
      // because the spend has no linked allocation yet).
      if (engineerTransactionId) {
        try {
          await cancelTransaction(supabase, {
            id: engineerTransactionId,
            reason: "Auto-reversed: task-work payment insert failed",
            cancelled_by: config.userName,
            cancelled_by_user_id: config.userId,
          });
        } catch (reverseErr) {
          console.error(
            "Failed to cancel orphan wallet spend after task-work payment insert failure:",
            reverseErr
          );
        }
      }
      throw error;
    }

    // Link the wallet transaction back to this package for the wallet ledger.
    if (engineerTransactionId) {
      await (supabase.from("site_engineer_transactions" as any) as any)
        .update({
          related_task_work_id: config.packageId,
          settlement_reference: config.packageNumber,
        })
        .eq("id", engineerTransactionId);
    }

    return {
      success: true,
      id: data.id,
      engineerTransactionId: engineerTransactionId || undefined,
    };
  } catch (error: any) {
    console.error("Error creating task-work payment:", error);
    return {
      success: false,
      error: error?.message || "Failed to record the payment.",
    };
  }
}

/**
 * Soft-delete a payment. If it was a wallet spend, mark the linked transaction
 * cancelled too (mirrors cancelMiscExpense). Reversing the wallet balance fully
 * is out of scope for v1 — admins can hard-reverse from the wallet ledger.
 */
export async function softDeleteTaskWorkPayment(
  supabase: SupabaseClient,
  paymentId: string,
  reason: string,
  userName: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: payment, error: fetchError } = await (
      supabase.from("task_work_payments" as any) as any
    )
      .select("id, engineer_transaction_id")
      .eq("id", paymentId)
      .single();
    if (fetchError) throw fetchError;

    const { error } = await (supabase.from("task_work_payments" as any) as any)
      .update({ is_deleted: true })
      .eq("id", paymentId);
    if (error) throw error;

    if (payment.engineer_transaction_id) {
      try {
        await cancelTransaction(supabase, {
          id: payment.engineer_transaction_id,
          reason: `Task-work payment deleted: ${reason}`,
          cancelled_by: userName,
          cancelled_by_user_id: userId,
        });
      } catch (e) {
        console.error("Failed to cancel wallet spend on payment delete:", e);
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error deleting task-work payment:", error);
    return { success: false, error: error?.message || "Failed to delete payment." };
  }
}
