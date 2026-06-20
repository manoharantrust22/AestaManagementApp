import { SupabaseClient } from "@supabase/supabase-js";
import dayjs from "dayjs";
import type {
  MiscExpense,
  MiscExpenseWithDetails,
  MiscExpenseResult,
  CreateMiscExpenseConfig,
  MiscExpenseStatsWithBreakdown,
  CategoryBreakdown,
} from "@/types/misc-expense.types";
import type {
  PayerSourceInput,
  PayerSourceSplitRow,
} from "@/types/settlement.types";
import {
  validatePayerSourceInput,
  toRpcArgs,
} from "@/lib/settlement/payerSource";
import { recordWalletSpending } from "./walletService";
import { recordSpend, cancelTransaction } from "./engineerWalletV2";
import { reverseWalletSpend } from "./walletSpendReverseService";

/**
 * Create a new miscellaneous expense with full payment tracking.
 * Follows the same patterns as settlement_groups and tea_shop_settlements.
 */
export async function createMiscExpense(
  supabase: SupabaseClient,
  config: CreateMiscExpenseConfig
): Promise<MiscExpenseResult> {
  try {
    const {
      siteId,
      formData,
      proofUrl,
      billUrl,
      userId,
      userName,
      batchAllocations,
      useV2Wallet,
    } = config;
    let engineerTransactionId: string | null = null;

    // Generate a fresh per-site reference (MISC-YYMMDD-NNN). Used for the initial
    // attempt and re-invoked by the insert retry below if a reference collides.
    const generateReference = async (): Promise<string> => {
      const { data: refData, error: refError } = await supabase.rpc(
        "generate_misc_expense_reference",
        { p_site_id: siteId }
      );
      if (refError) {
        console.warn("Could not generate misc expense reference:", refError);
        // Fallback reference with UUID-based suffix for uniqueness
        const uniqueSuffix = crypto.randomUUID().slice(0, 8).toUpperCase();
        return `MISC-${dayjs().format("YYMMDD")}-${uniqueSuffix}`;
      }
      return refData as string;
    };

    // 1. Generate reference number FIRST
    let referenceNumber: string = await generateReference();

    // 2. Validate payer-source input + serialise for the insert.
    // Must run BEFORE the wallet spend below — otherwise a malformed split
    // would debit the engineer's wallet with no misc_expense row to settle
    // against, leaving a phantom spend in the ledger.
    const payerCheck = validatePayerSourceInput(
      formData.payer,
      formData.amount,
    );
    if (!payerCheck.ok) {
      return {
        success: false,
        error: `Invalid payer source: ${payerCheck.reason}`,
      };
    }
    const payerRpc = toRpcArgs(formData.payer);

    // 3. If via engineer wallet, record spending transaction
    if (formData.payer_type === "site_engineer" && formData.site_engineer_id) {
      if (useV2Wallet) {
        // v2 path: single LIFO pool, no batches. Atomic via RPC with WLT01 on
        // insufficient balance. The wallet ledger only models cash/upi/bank
        // — cheque/other modes collapse to cash for ledger attribution.
        const walletMode =
          formData.payment_mode === "upi"
            ? "upi"
            : formData.payment_mode === "bank_transfer"
            ? "bank_transfer"
            : "cash";
        const spendResult = await recordSpend(supabase, {
          engineer_id: formData.site_engineer_id,
          site_id: siteId,
          amount: formData.amount,
          transaction_date: formData.date,
          payment_mode: walletMode,
          proof_url: proofUrl ?? null,
          notes: formData.notes ?? null,
          recorded_by: userName,
          recorded_by_user_id: userId,
          description: `Misc expense ${referenceNumber}${formData.vendor_name ? ` - ${formData.vendor_name}` : ""}`,
        });
        engineerTransactionId = spendResult.id;
      } else {
        // v1 legacy path: batch-allocated. Required for callers that still
        // surface a BatchSelector UI.
        if (!batchAllocations || batchAllocations.length === 0) {
          throw new Error("Batch allocation required for engineer wallet payment. Please select which wallet batches to use.");
        }

        const spendingResult = await recordWalletSpending(supabase, {
          engineerId: formData.site_engineer_id,
          amount: formData.amount,
          siteId: siteId,
          description: `Misc expense ${referenceNumber}${formData.vendor_name ? ` - ${formData.vendor_name}` : ""}`,
          recipientType: "vendor",
          paymentMode: formData.payment_mode,
          moneySource: "wallet",
          batchAllocations: batchAllocations,
          subcontractId: formData.subcontract_id || undefined,
          proofUrl: proofUrl,
          notes: formData.notes,
          transactionDate: formData.date,
          userName: userName,
          userId: userId,
          settlementReference: referenceNumber,
        });

        if (!spendingResult.success) {
          throw new Error(spendingResult.error || "Failed to record wallet spending");
        }

        engineerTransactionId = spendingResult.transactionId || null;
      }
    }

    // 4. Create misc_expenses record
    const expenseData = {
      site_id: siteId,
      reference_number: referenceNumber,
      date: formData.date,
      amount: formData.amount,
      category_id: formData.category_id || null,
      description: formData.description || null,
      vendor_name: formData.vendor_name || null,
      payment_mode: formData.payment_mode,
      // For an engineer WALLET spend the source is NOT a manual pick — it is
      // derived from how the wallet was funded (FIFO over deposit sources). We
      // store NULL here and let sync_misc_expense_source() fill the real
      // source(s) from the spend's allocations (see the rpc call below). Only
      // the company_direct path keeps the manually chosen payer source.
      payer_source: engineerTransactionId ? null : payerRpc.p_payer_source,
      payer_name: engineerTransactionId ? null : payerRpc.p_payer_name,
      // `payer_source_split` is `PayerSourceSplitRow[] | null`; the Supabase
      // JS client serialises it to JSONB on insert.
      payer_source_split: engineerTransactionId
        ? null
        : (payerRpc.p_payer_source_split as PayerSourceSplitRow[] | null),
      payer_type: formData.payer_type,
      site_engineer_id: formData.payer_type === "site_engineer" ? formData.site_engineer_id : null,
      engineer_transaction_id: engineerTransactionId,
      proof_url: proofUrl || null,
      bill_url: billUrl || null,
      subcontract_id: formData.subcontract_id || null,
      notes: formData.notes || null,
      // Cleared = the company's money has actually left.
      // - company_direct → company paid the vendor directly → cleared
      // - site_engineer WITH wallet debit (engineerTransactionId set) → company's
      //   money left via the engineer's wallet (which was funded by company
      //   deposits) → cleared
      // - site_engineer WITHOUT wallet debit (engineer paid out-of-pocket) →
      //   pending until the company reimburses the engineer
      is_cleared:
        formData.payer_type === "company_direct" || engineerTransactionId !== null,
      created_by: userId,
      created_by_name: userName,
    };

    // Insert with retry on a unique-reference collision. The (site_id,
    // reference_number) constraint normally prevents cross-site collisions, but a
    // rare same-site concurrent insert can still race (the generator's advisory
    // lock releases before this insert). On a 23505 we regenerate a fresh
    // reference and retry, so a collision never surfaces to the engineer.
    const MAX_INSERT_ATTEMPTS = 5;
    let expenseRecord: any = null;
    let lastInsertError: any = null;
    for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt++) {
      expenseData.reference_number = referenceNumber;
      const { data, error } = await (supabase
        .from("misc_expenses") as any)
        .insert(expenseData)
        .select()
        .single();
      if (!error) {
        expenseRecord = data;
        break;
      }
      lastInsertError = error;
      const isUniqueViolation =
        error.code === "23505" ||
        /duplicate key value|unique constraint/i.test(error.message ?? "");
      if (!isUniqueViolation || attempt === MAX_INSERT_ATTEMPTS - 1) break;
      // Collision — regenerate a fresh reference and try again.
      referenceNumber = await generateReference();
    }

    if (!expenseRecord) {
      // The insert ultimately failed. If we already debited the engineer's wallet
      // (the spend is recorded BEFORE this insert), soft-cancel it so we don't
      // leave an orphan phantom spend in the ledger. reverse_wallet_spend can't be
      // used here — it rejects spends with no linked source — so cancel directly.
      if (engineerTransactionId) {
        try {
          await cancelTransaction(supabase, {
            id: engineerTransactionId,
            reason:
              "Auto-reversed: misc expense insert failed (reference collision)",
            cancelled_by: userName,
            cancelled_by_user_id: userId,
          });
        } catch (reverseErr) {
          console.error(
            "Failed to cancel orphan wallet spend after misc insert failure:",
            reverseErr
          );
        }
      }
      throw lastInsertError ?? new Error("Failed to create miscellaneous expense");
    }

    // 5. Update engineer transaction with expense reference (if applicable)
    if (engineerTransactionId) {
      await (supabase
        .from("site_engineer_transactions") as any)
        .update({
          settlement_reference: referenceNumber,
        })
        .eq("id", engineerTransactionId);

      // 5b. Derive the misc expense's true payment source from the wallet
      // spend's FIFO allocations (Amma / Trust / split / pending), replacing the
      // NULL we inserted above. Keeps the displayed source honest and in sync.
      await (supabase as any).rpc("sync_misc_expense_source", {
        p_misc_id: expenseRecord.id,
      });
    }

    return {
      success: true,
      expenseId: expenseRecord.id,
      referenceNumber: referenceNumber,
      engineerTransactionId: engineerTransactionId || undefined,
    };
  } catch (error: any) {
    console.error("Error creating misc expense:", error);
    return {
      success: false,
      error: error.message || "Failed to create miscellaneous expense",
    };
  }
}

/**
 * Update an existing miscellaneous expense.
 * Note: Cannot change payer_type after creation (would require complex wallet adjustments).
 */
export async function updateMiscExpense(
  supabase: SupabaseClient,
  expenseId: string,
  updates: {
    date?: string;
    amount?: number;
    category_id?: string | null;
    description?: string | null;
    vendor_name?: string | null;
    payment_mode?: string;
    /**
     * Payer-source input — optional because most edits don't touch the
     * payer. Replaces the legacy `payer_source` + `custom_payer_name` pair.
     */
    payer?: PayerSourceInput;
    subcontract_id?: string | null;
    notes?: string | null;
    proof_url?: string | null;
    /**
     * Optional vendor bill image URL. New misc_expenses.bill_url column.
     * Pass `null` to clear an existing value; omit to leave unchanged.
     */
    bill_url?: string | null;
  },
  userId: string,
  userName: string
): Promise<MiscExpenseResult> {
  try {
    // Strip `payer` from the shallow spread; it is not a DB column.
    const { payer: payerUpdate, ...rest } = updates;
    const updateData: any = {
      ...rest,
      updated_at: new Date().toISOString(),
    };

    // Translate the payer-source input into the 3 actual DB columns.
    if (payerUpdate) {
      // `amount` may not be present in an edit that only changes the payer.
      // Pass 0 to skip the sum-to-total check; the form's own submit
      // validator (Task 5) enforces sum-to-total before calling here, and
      // the SQL CHECK constraint rejects malformed shapes regardless.
      const payerCheck = validatePayerSourceInput(
        payerUpdate,
        updates.amount ?? 0,
      );
      if (
        !payerCheck.ok &&
        payerUpdate.mode === "split" &&
        !payerCheck.reason.startsWith("split sum")
      ) {
        return {
          success: false,
          error: `Invalid payer source: ${payerCheck.reason}`,
        };
      }
      const payerRpc = toRpcArgs(payerUpdate);
      updateData.payer_source = payerRpc.p_payer_source;
      updateData.payer_name = payerRpc.p_payer_name;
      updateData.payer_source_split =
        payerRpc.p_payer_source_split as PayerSourceSplitRow[] | null;
    }

    const { error } = await (supabase
      .from("misc_expenses") as any)
      .update(updateData)
      .eq("id", expenseId);

    if (error) {
      throw error;
    }

    return {
      success: true,
      expenseId,
    };
  } catch (error: any) {
    console.error("Error updating misc expense:", error);
    return {
      success: false,
      error: error.message || "Failed to update miscellaneous expense",
    };
  }
}

/**
 * Cancel a miscellaneous expense (soft delete).
 * Also handles engineer wallet transaction cancellation if applicable.
 */
export async function cancelMiscExpense(
  supabase: SupabaseClient,
  expenseId: string,
  reason: string,
  userId: string,
  userName: string
): Promise<MiscExpenseResult> {
  try {
    // First, get the expense to check if it has an engineer transaction
    const { data: expense, error: fetchError } = await (supabase
      .from("misc_expenses") as any)
      .select("id, reference_number, engineer_transaction_id")
      .eq("id", expenseId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    if (expense.engineer_transaction_id) {
      // Wallet-funded expense: use the canonical reversal. This soft-cancels the
      // wallet spend (sets cancelled_at → refunds the wallet + drops it from the
      // Activity list and per-source pools) AND cascades to mark this misc_expenses
      // row cancelled, set the cancellation reason/user, and clear the link.
      // (Mode 'undo' = void the spend so it can be re-entered, e.g. as task work.)
      await reverseWalletSpend(supabase, {
        spendId: expense.engineer_transaction_id,
        mode: "undo",
        reason,
      });
    } else {
      // Company-direct expense: no wallet spend, just soft-cancel the misc row.
      const { error: cancelError } = await (supabase
        .from("misc_expenses") as any)
        .update({
          is_cancelled: true,
          cancelled_at: new Date().toISOString(),
          cancelled_by_user_id: userId,
          cancellation_reason: reason,
          updated_at: new Date().toISOString(),
        })
        .eq("id", expenseId);

      if (cancelError) {
        throw cancelError;
      }
    }

    return {
      success: true,
      expenseId,
      referenceNumber: expense.reference_number,
    };
  } catch (error: any) {
    console.error("Error cancelling misc expense:", error);
    return {
      success: false,
      error: error.message || "Failed to cancel miscellaneous expense",
    };
  }
}

/**
 * Get a miscellaneous expense by its reference number.
 */
export async function getMiscExpenseByReference(
  supabase: SupabaseClient,
  reference: string
): Promise<MiscExpenseWithDetails | null> {
  try {
    const { data, error } = await (supabase
      .from("misc_expenses") as any)
      .select(`
        *,
        expense_categories(name),
        subcontracts(title),
        users!misc_expenses_site_engineer_id_fkey(name)
      `)
      .eq("reference_number", reference)
      .single();

    if (error || !data) {
      return null;
    }

    return {
      ...data,
      category_name: data.expense_categories?.name,
      subcontract_title: data.subcontracts?.title,
      site_engineer_name: data.users?.name,
    };
  } catch (error) {
    console.error("Error fetching misc expense by reference:", error);
    return null;
  }
}

/**
 * Get all miscellaneous expenses for a site within a date range.
 */
export async function getMiscExpenses(
  supabase: SupabaseClient,
  siteId: string,
  options?: {
    dateFrom?: string;
    dateTo?: string;
    includesCancelled?: boolean;
  }
): Promise<MiscExpenseWithDetails[]> {
  try {
    let query = (supabase
      .from("misc_expenses") as any)
      .select(`
        *,
        expense_categories(name),
        subcontracts(title),
        users!misc_expenses_site_engineer_id_fkey(name)
      `)
      .eq("site_id", siteId)
      .order("date", { ascending: false });

    if (!options?.includesCancelled) {
      query = query.eq("is_cancelled", false);
    }

    if (options?.dateFrom) {
      query = query.gte("date", options.dateFrom);
    }

    if (options?.dateTo) {
      query = query.lte("date", options.dateTo);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return (data || []).map((item: any) => ({
      ...item,
      category_name: item.expense_categories?.name,
      subcontract_title: item.subcontracts?.title,
      site_engineer_name: item.users?.name,
    }));
  } catch (error) {
    console.error("Error fetching misc expenses:", error);
    return [];
  }
}

/**
 * Get statistics for miscellaneous expenses with category breakdown.
 */
export async function getMiscExpenseStats(
  supabase: SupabaseClient,
  siteId: string,
  options?: {
    dateFrom?: string;
    dateTo?: string;
  }
): Promise<MiscExpenseStatsWithBreakdown> {
  try {
    let query = (supabase
      .from("misc_expenses") as any)
      .select(`
        amount,
        is_cleared,
        category_id,
        expense_categories(id, name)
      `)
      .eq("site_id", siteId)
      .eq("is_cancelled", false);

    if (options?.dateFrom) {
      query = query.gte("date", options.dateFrom);
    }

    if (options?.dateTo) {
      query = query.lte("date", options.dateTo);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const expenses = data || [];

    // Calculate totals
    const total = expenses.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
    const cleared = expenses.filter((e: any) => e.is_cleared).reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
    const pending = total - cleared;
    const clearedCount = expenses.filter((e: any) => e.is_cleared).length;
    const pendingCount = expenses.length - clearedCount;

    // Build category breakdown
    const breakdownMap = new Map<string, CategoryBreakdown>();

    for (const expense of expenses) {
      const catId = expense.category_id;
      const catName = expense.expense_categories?.name || "Uncategorized";
      const key = catId || "uncategorized";

      if (!breakdownMap.has(key)) {
        breakdownMap.set(key, {
          categoryId: catId,
          categoryName: catName,
          count: 0,
          totalAmount: 0,
        });
      }

      const breakdown = breakdownMap.get(key)!;
      breakdown.count += 1;
      breakdown.totalAmount += expense.amount || 0;
    }

    // Convert to array and sort by amount (descending)
    const categoryBreakdown = Array.from(breakdownMap.values())
      .sort((a, b) => b.totalAmount - a.totalAmount);

    return {
      total,
      cleared,
      pending,
      totalCount: expenses.length,
      clearedCount,
      pendingCount,
      categoryBreakdown,
    };
  } catch (error) {
    console.error("Error fetching misc expense stats:", error);
    return {
      total: 0,
      cleared: 0,
      pending: 0,
      totalCount: 0,
      clearedCount: 0,
      pendingCount: 0,
      categoryBreakdown: [],
    };
  }
}
