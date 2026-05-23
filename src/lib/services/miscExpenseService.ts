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
import type { PayerSource } from "@/types/settlement.types";
import { recordWalletSpending } from "./walletService";
import { recordSpend } from "./engineerWalletV2";

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
    let referenceNumber: string | undefined;

    // 1. Generate reference number FIRST
    const { data: refData, error: refError } = await supabase.rpc(
      "generate_misc_expense_reference",
      { p_site_id: siteId }
    );

    if (refError) {
      console.warn("Could not generate misc expense reference:", refError);
      // Fallback reference with UUID-based suffix for uniqueness
      const uniqueSuffix = crypto.randomUUID().slice(0, 8).toUpperCase();
      referenceNumber = `MISC-${dayjs().format("YYMMDD")}-${uniqueSuffix}`;
    } else {
      referenceNumber = refData as string;
    }

    // 2. If via engineer wallet, record spending transaction
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

    // 3. Create misc_expenses record
    const expenseData = {
      site_id: siteId,
      reference_number: referenceNumber,
      date: formData.date,
      amount: formData.amount,
      category_id: formData.category_id || null,
      description: formData.description || null,
      vendor_name: formData.vendor_name || null,
      payment_mode: formData.payment_mode,
      payer_source: formData.payer_source,
      payer_name: (formData.payer_source === "custom" || formData.payer_source === "other_site_money")
        ? formData.custom_payer_name
        : null,
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

    const { data: expenseRecord, error: expenseError } = await (supabase
      .from("misc_expenses") as any)
      .insert(expenseData)
      .select()
      .single();

    if (expenseError) {
      throw expenseError;
    }

    // 4. Update engineer transaction with expense reference (if applicable)
    if (engineerTransactionId) {
      await (supabase
        .from("site_engineer_transactions") as any)
        .update({
          settlement_reference: referenceNumber,
        })
        .eq("id", engineerTransactionId);
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
    payer_source?: PayerSource;
    custom_payer_name?: string;
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
    const updateData: any = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    // Handle payer_name based on payer_source
    if (updates.payer_source) {
      updateData.payer_name = (updates.payer_source === "custom" || updates.payer_source === "other_site_money")
        ? updates.custom_payer_name
        : null;
      delete updateData.custom_payer_name;
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

    // Cancel the expense
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

    // If there was an engineer transaction, mark it as cancelled too
    if (expense.engineer_transaction_id) {
      await (supabase
        .from("site_engineer_transactions") as any)
        .update({
          settlement_status: "cancelled",
          notes: `Cancelled: ${reason}`,
        })
        .eq("id", expense.engineer_transaction_id);
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
