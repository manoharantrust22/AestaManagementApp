import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database.types";

// OPTIMIZATION: Cache for expense category lookup to avoid repeated queries
let cachedSalaryCategoryId: string | null = null;
let categoryCacheExpiry = 0;
const CATEGORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get salary/labor expense category ID with caching
 * Avoids repeated queries for the same category
 */
async function getSalaryExpenseCategoryId(
  supabase: SupabaseClient<Database>
): Promise<string | null> {
  // Return cached value if still valid
  if (cachedSalaryCategoryId && Date.now() < categoryCacheExpiry) {
    return cachedSalaryCategoryId;
  }

  // Try "Salary Settlement" category first
  const { data: categories } = await supabase
    .from("expense_categories")
    .select("id")
    .eq("name", "Salary Settlement")
    .limit(1);

  let categoryId = categories?.[0]?.id;

  // Fallback to "Labor" category
  if (!categoryId) {
    const { data: laborCategories } = await supabase
      .from("expense_categories")
      .select("id")
      .ilike("name", "%labor%")
      .limit(1);

    categoryId = laborCategories?.[0]?.id;
  }

  // Cache the result
  if (categoryId) {
    cachedSalaryCategoryId = categoryId;
    categoryCacheExpiry = Date.now() + CATEGORY_CACHE_TTL;
  }

  return categoryId || null;
}

export interface LaborerDetails {
  dailyCount: number;
  marketCount: number;
  totalAmount: number;
  laborerNames?: string[];
}

export interface TransactionWithLaborers {
  id: string;
  amount: number;
  description: string | null;
  transaction_date: string;
  settlement_status: string | null;
  settlement_mode: string | null;
  settlement_proof_url: string | null;
  settlement_reason?: string | null;
  dispute_notes?: string | null;
  user_id: string;
  site_id: string | null;
  engineer_name?: string;
  daily_attendance: Array<{
    id: string;
    laborer_name: string;
    daily_earnings: number;
    date: string;
  }>;
  market_attendance: Array<{
    id: string;
    role_name: string;
    count: number;
    rate_per_person: number;
    total_cost: number;
    date: string;
  }>;
}

/**
 * Get all admin and office user IDs for notification distribution
 */
export async function getAdminOfficeUserIds(
  supabase: SupabaseClient<Database>
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .in("role", ["admin", "office"])
      .eq("status", "active");

    if (error) throw error;
    return data?.map((user) => user.id) || [];
  } catch (err) {
    console.error("Error fetching admin/office users:", err);
    return [];
  }
}

/**
 * Get transaction with linked laborer details for settlement form
 */
export async function getTransactionWithLaborers(
  supabase: SupabaseClient<Database>,
  transactionId: string
): Promise<{ data: TransactionWithLaborers | null; error: Error | null }> {
  try {
    // Fetch the transaction
    const { data: transaction, error: txError } = await supabase
      .from("site_engineer_transactions")
      .select(
        `
        id,
        amount,
        description,
        transaction_date,
        settlement_status,
        settlement_mode,
        settlement_proof_url,
        notes,
        user_id,
        site_id,
        users!site_engineer_transactions_user_id_fkey (name)
      `
      )
      .eq("id", transactionId)
      .single();

    if (txError) throw txError;
    if (!transaction) throw new Error("Transaction not found");

    // Fetch daily attendance linked to this transaction
    const { data: dailyAttendance, error: dailyError } = await supabase
      .from("daily_attendance")
      .select(
        `
        id,
        daily_earnings,
        date,
        laborers!daily_attendance_laborer_id_fkey (name)
      `
      )
      .eq("engineer_transaction_id", transactionId);

    if (dailyError) throw dailyError;

    // Fetch market laborer attendance linked to this transaction
    // Note: Using separate query for role names to avoid FK cache issues
    const { data: marketAttendance, error: marketError } = await supabase
      .from("market_laborer_attendance")
      .select(
        `
        id,
        count,
        rate_per_person,
        total_cost,
        date,
        role_id
      `
      )
      .eq("engineer_transaction_id", transactionId);

    if (marketError) throw marketError;

    // Fetch role names separately to avoid FK schema cache issues
    const roleIds = marketAttendance
      ?.map((ma) => ma.role_id)
      .filter((id): id is string => id != null) || [];

    let rolesMap: Record<string, string> = {};
    if (roleIds.length > 0) {
      const { data: roles } = await supabase
        .from("labor_roles")
        .select("id, name")
        .in("id", roleIds);

      rolesMap = (roles || []).reduce((acc, role) => {
        acc[role.id] = role.name;
        return acc;
      }, {} as Record<string, string>);
    }

    const result: TransactionWithLaborers = {
      id: transaction.id,
      amount: transaction.amount,
      description: transaction.description,
      transaction_date: transaction.transaction_date,
      settlement_status: transaction.settlement_status,
      settlement_mode: transaction.settlement_mode,
      settlement_proof_url: transaction.settlement_proof_url,
      settlement_reason: (transaction as Record<string, unknown>)
        .notes as string | null,
      user_id: transaction.user_id,
      site_id: transaction.site_id,
      engineer_name: (
        transaction.users as unknown as { name: string } | null
      )?.name,
      daily_attendance:
        dailyAttendance?.map((da) => ({
          id: da.id,
          laborer_name:
            (da.laborers as unknown as { name: string } | null)?.name ||
            "Unknown",
          daily_earnings: da.daily_earnings || 0,
          date: da.date,
        })) || [],
      market_attendance:
        marketAttendance?.map((ma) => ({
          id: ma.id,
          role_name: ma.role_id ? rolesMap[ma.role_id] || "Unknown" : "Unknown",
          count: ma.count || 0,
          rate_per_person: ma.rate_per_person || 0,
          total_cost: ma.total_cost || 0,
          date: ma.date,
        })) || [],
    };

    return { data: result, error: null };
  } catch (err) {
    console.error("Error fetching transaction with laborers:", err);
    return { data: null, error: err as Error };
  }
}

/**
 * Submit settlement - update transaction and create the pending expense
 */
export async function submitSettlement(
  supabase: SupabaseClient<Database>,
  transactionId: string,
  settlementMode: "upi" | "cash",
  settledByUserId: string,
  settledByName: string,
  proofUrl?: string,
  reason?: string
): Promise<{ error: Error | null }> {
  try {
    // Update the transaction
    const updateData: Record<string, unknown> = {
      settlement_status: "pending_confirmation",
      settlement_mode: settlementMode,
      settled_by: settledByUserId,
      settled_date: new Date().toISOString().split("T")[0],
      updated_at: new Date().toISOString(),
    };

    if (settlementMode === "upi" && proofUrl) {
      updateData.settlement_proof_url = proofUrl;
    }

    // Save notes for BOTH UPI and cash payments
    if (reason) {
      updateData.notes = reason;
    }

    const { data: transaction, error: updateError } = await supabase
      .from("site_engineer_transactions")
      .update(updateData)
      .eq("id", transactionId)
      .select("amount, site_id, related_subcontract_id, description")
      .single();

    if (updateError) throw updateError;

    // Create pending expense (will be marked cleared when admin confirms)
    // This allows the expense to show as "Pending" in daily expenses until approved
    if (transaction?.site_id && transaction?.amount > 0) {
      try {
        await createSettlementExpense(supabase, {
          siteId: transaction.site_id,
          amount: transaction.amount,
          date: new Date().toISOString().split("T")[0],
          description: transaction.description || "Laborer salary settlement",
          subcontractId: transaction.related_subcontract_id,
          proofUrl: proofUrl || null,
          paidBy: settledByName,
          paidByUserId: settledByUserId,
          isCleared: false, // PENDING state - will be marked cleared on admin confirmation
          engineerTransactionId: transactionId,
        });
        console.log("Created pending expense for settlement:", transactionId);
      } catch (expenseErr) {
        console.warn("Failed to create pending expense (non-critical):", expenseErr);
      }
    }

    return { error: null };
  } catch (err) {
    console.error("Error submitting settlement:", err);
    return { error: err as Error };
  }
}

/**
 * Confirm settlement - admin action to confirm engineer's settlement
 * Also marks linked attendance as paid and creates daily expense entry
 */
export async function confirmSettlement(
  supabase: SupabaseClient<Database>,
  transactionId: string,
  confirmedByUserId: string,
  confirmedByName: string
): Promise<{ error: Error | null }> {
  try {
    // 1. Get transaction details
    const { data: transaction, error: txError } = await supabase
      .from("site_engineer_transactions")
      .select("id, amount, site_id, transaction_date, description, settlement_proof_url, related_subcontract_id")
      .eq("id", transactionId)
      .single();

    if (txError) throw txError;
    if (!transaction) throw new Error("Transaction not found");

    const paymentDate = new Date().toISOString().split("T")[0];

    // 2. Update transaction status
    const { error } = await supabase
      .from("site_engineer_transactions")
      .update({
        settlement_status: "confirmed",
        confirmed_by: confirmedByName,
        confirmed_by_user_id: confirmedByUserId,
        confirmed_at: new Date().toISOString(),
        is_settled: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", transactionId);

    if (error) throw error;

    // 3. Mark linked daily attendance as paid
    const { data: dailyUpdated, error: dailyError } = await supabase
      .from("daily_attendance")
      .update({
        is_paid: true,
        payment_date: paymentDate,
      })
      .eq("engineer_transaction_id", transactionId)
      .select("id");

    if (dailyError) {
      console.error("Error updating daily attendance:", dailyError);
    } else {
      console.log(`Updated ${dailyUpdated?.length || 0} daily attendance records to is_paid=true`);
    }

    // 4. Mark linked market attendance as paid
    const { data: marketUpdated, error: marketError } = await supabase
      .from("market_laborer_attendance")
      .update({
        is_paid: true,
        payment_date: paymentDate,
      })
      .eq("engineer_transaction_id", transactionId)
      .select("id");

    if (marketError) {
      console.error("Error updating market attendance:", marketError);
    } else {
      console.log(`Updated ${marketUpdated?.length || 0} market attendance records to is_paid=true`);
    }

    // 5. Mark linked expense as cleared (or create if not found for old transactions)
    if (transaction.site_id && transaction.amount > 0) {
      // First, try to find existing pending expense linked to this transaction
      const { data: existingExpense, error: findError } = await supabase
        .from("expenses")
        .select("id")
        .eq("engineer_transaction_id", transactionId)
        .single();

      if (existingExpense && !findError) {
        // Update existing expense to cleared
        const { error: updateExpenseError } = await supabase
          .from("expenses")
          .update({
            is_cleared: true,
            cleared_date: paymentDate,
          })
          .eq("id", existingExpense.id);

        if (updateExpenseError) {
          console.error("Error updating expense to cleared:", updateExpenseError);
        } else {
          console.log(`Expense ${existingExpense.id} marked as cleared`);
        }
      } else {
        // Fallback: Create expense if not found (for old transactions without pending expense)
        console.log("No pending expense found, creating new cleared expense");
        await createSettlementExpense(supabase, {
          siteId: transaction.site_id,
          amount: transaction.amount,
          date: transaction.transaction_date,
          description: transaction.description || "Laborer salary settlement",
          subcontractId: transaction.related_subcontract_id,
          proofUrl: transaction.settlement_proof_url,
          paidBy: confirmedByName,
          paidByUserId: confirmedByUserId,
          isCleared: true,
          engineerTransactionId: transactionId,
        });
      }
    } else {
      console.log(`Skipping expense update: site_id=${transaction.site_id}, amount=${transaction.amount}`);
    }

    return { error: null };
  } catch (err) {
    console.error("Error confirming settlement:", err);
    return { error: err as Error };
  }
}

/**
 * Create a daily expense entry for a confirmed settlement
 * OPTIMIZED: Uses cached category lookup
 */
async function createSettlementExpense(
  supabase: SupabaseClient<Database>,
  params: {
    siteId: string;
    amount: number;
    date: string;
    description: string;
    subcontractId: string | null;
    proofUrl: string | null;
    paidBy: string;
    paidByUserId: string;
    isCleared?: boolean; // Default true for backward compatibility
    engineerTransactionId?: string; // Link to engineer transaction
  }
): Promise<void> {
  try {
    // OPTIMIZED: Use cached category lookup
    const categoryId = await getSalaryExpenseCategoryId(supabase);

    // If still no category, skip expense creation
    if (!categoryId) {
      console.warn("No suitable expense category found for salary settlement");
      return;
    }

    // Build description with "Via Engineer" indicator
    let fullDescription = params.description;
    if (!fullDescription.includes("Via Engineer") &&
        !fullDescription.includes("Direct by Company")) {
      fullDescription += " - Via Engineer";
    }

    // Create expense entry
    // Note: paid_by is a FK to users.id, so we use paidByUserId (UUID)
    // entered_by is a string field for the name
    const isCleared = params.isCleared ?? true; // Default to cleared for backward compatibility
    const expenseData = {
      site_id: params.siteId,
      category_id: categoryId,
      amount: params.amount,
      date: params.date,
      description: fullDescription,
      contract_id: params.subcontractId,
      receipt_url: params.proofUrl,
      module: "labor" as const,
      paid_by: params.paidByUserId, // FK to users.id - must be UUID
      entered_by: params.paidBy, // String field for name
      entered_by_user_id: params.paidByUserId,
      is_cleared: isCleared,
      cleared_date: isCleared ? params.date : null,
      engineer_transaction_id: params.engineerTransactionId || null,
    };

    console.log("Creating settlement expense with data:", expenseData);

    const { data: insertedExpense, error: expenseError } = await supabase
      .from("expenses")
      .insert(expenseData)
      .select()
      .single();

    if (expenseError) {
      console.error("Error creating settlement expense:", {
        error: expenseError,
        message: expenseError.message,
        details: expenseError.details,
        hint: expenseError.hint,
        code: expenseError.code,
      });
    } else {
      console.log("Settlement expense created successfully:", insertedExpense?.id);
    }
  } catch (err) {
    console.error("Error in createSettlementExpense:", err);
  }
}

/**
 * Parameters for creating a salary expense entry
 */
export interface SalaryExpenseParams {
  siteId: string;
  amount: number;
  date: string;
  description: string;
  paymentMode?: string;
  paidBy: string;
  paidByUserId: string;
  proofUrl?: string | null;
  subcontractId?: string | null;
  isCleared: boolean; // false = "Pending from Company"
  engineerTransactionId?: string | null; // Link to engineer transaction for tracking
  paymentSource: "direct" | "via_engineer" | "engineer_own_money";
}

/**
 * Create a salary/labor expense entry in daily expenses
 * Used for:
 * 1. Direct payments by company
 * 2. Engineer settlements (via company money)
 * 3. Engineer's own money payments (pending reimbursement)
 * OPTIMIZED: Uses cached category lookup
 */
export async function createSalaryExpense(
  supabase: SupabaseClient<Database>,
  params: SalaryExpenseParams
): Promise<{ error: Error | null; expenseId: string | null }> {
  try {
    // OPTIMIZED: Use cached category lookup
    const categoryId = await getSalaryExpenseCategoryId(supabase);

    // If still no category, return error
    if (!categoryId) {
      console.warn("No suitable expense category found for salary expense");
      return { error: new Error("No expense category found"), expenseId: null };
    }

    // Build description with source indicator
    let fullDescription = params.description;
    if (!fullDescription.includes("Direct by Company") &&
        !fullDescription.includes("Via Engineer") &&
        !fullDescription.includes("Pending from Company")) {
      switch (params.paymentSource) {
        case "direct":
          fullDescription += " - Direct by Company";
          break;
        case "via_engineer":
          fullDescription += " - Via Engineer";
          break;
        case "engineer_own_money":
          fullDescription += " - Pending from Company";
          break;
      }
    }

    // Create expense entry
    const { data: expense, error: expenseError } = await supabase
      .from("expenses")
      .insert({
        site_id: params.siteId,
        category_id: categoryId,
        amount: params.amount,
        date: params.date,
        description: fullDescription,
        contract_id: params.subcontractId || null,
        receipt_url: params.proofUrl || null,
        module: "labor",
        paid_by: params.paidByUserId, // UUID - foreign key to users table
        entered_by: params.paidBy, // Name string
        entered_by_user_id: params.paidByUserId,
        is_cleared: params.isCleared,
        cleared_date: params.isCleared ? params.date : null,
        payment_mode: params.paymentMode as any || null,
        engineer_transaction_id: params.engineerTransactionId || null,
      })
      .select("id")
      .single();

    if (expenseError) {
      console.error("Error creating salary expense:", expenseError);
      return { error: expenseError, expenseId: null };
    }

    return { error: null, expenseId: expense?.id || null };
  } catch (err) {
    console.error("Error in createSalaryExpense:", err);
    return { error: err as Error, expenseId: null };
  }
}

/**
 * Clear a pending salary expense when engineer is reimbursed
 * Updates is_cleared to true and removes "Pending from Company" indicator
 * Also propagates contract_id from the engineer transaction's related_subcontract_id
 */
export async function clearPendingSalaryExpense(
  supabase: SupabaseClient<Database>,
  engineerTransactionId: string
): Promise<{ error: Error | null }> {
  try {
    // First, find the expense by engineer_transaction_id
    const { data: expense, error: fetchError } = await supabase
      .from("expenses")
      .select("id, description, contract_id")
      .eq("engineer_transaction_id", engineerTransactionId)
      .single();

    if (fetchError || !expense) {
      // No expense found - might not have been created yet
      return { error: null };
    }

    // Fetch the engineer transaction to get related_subcontract_id
    const { data: transaction } = await (supabase
      .from("site_engineer_transactions") as any)
      .select("related_subcontract_id")
      .eq("id", engineerTransactionId)
      .single();

    // Update the expense to mark as cleared
    const newDescription = expense.description
      ?.replace(" - Pending from Company", " - Via Engineer (Reimbursed)")
      || "Laborer salary - Via Engineer (Reimbursed)";

    // Build update object - include contract_id if transaction has it and expense doesn't
    const updateData: any = {
      is_cleared: true,
      cleared_date: new Date().toISOString().split("T")[0],
      description: newDescription,
    };

    // Propagate contract_id from transaction if expense doesn't have one
    if (!expense.contract_id && transaction?.related_subcontract_id) {
      updateData.contract_id = transaction.related_subcontract_id;
    }

    const { error: updateError } = await supabase
      .from("expenses")
      .update(updateData)
      .eq("id", expense.id);

    if (updateError) {
      console.error("Error clearing pending salary expense:", updateError);
      return { error: updateError };
    }

    return { error: null };
  } catch (err) {
    console.error("Error in clearPendingSalaryExpense:", err);
    return { error: err as Error };
  }
}

/**
 * Dispute settlement - admin action to dispute engineer's settlement
 */
export async function disputeSettlement(
  supabase: SupabaseClient<Database>,
  transactionId: string,
  disputeNotes: string
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from("site_engineer_transactions")
      .update({
        settlement_status: "disputed",
        dispute_notes: disputeNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", transactionId);

    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error("Error disputing settlement:", err);
    return { error: err as Error };
  }
}

/**
 * Get pending settlements for a site engineer
 */
export async function getPendingSettlements(
  supabase: SupabaseClient<Database>,
  engineerUserId: string
): Promise<{
  data: Array<{
    id: string;
    amount: number;
    description: string | null;
    transaction_date: string;
    site_name: string | null;
  }>;
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase
      .from("site_engineer_transactions")
      .select(
        `
        id,
        amount,
        description,
        transaction_date,
        sites!site_engineer_transactions_site_id_fkey (name)
      `
      )
      .eq("user_id", engineerUserId)
      .eq("transaction_type", "received_from_company")
      .eq("settlement_status", "pending_settlement")
      .order("transaction_date", { ascending: false });

    if (error) throw error;

    const result =
      data?.map((tx) => ({
        id: tx.id,
        amount: tx.amount,
        description: tx.description,
        transaction_date: tx.transaction_date,
        site_name: (tx.sites as unknown as { name: string } | null)?.name || null,
      })) || [];

    return { data: result, error: null };
  } catch (err) {
    console.error("Error fetching pending settlements:", err);
    return { data: [], error: err as Error };
  }
}

/**
 * Data migration: Fix expenses that are missing contract_id
 * This syncs contract_id from attendance records and engineer transactions
 *
 * Run this once to fix existing data after the code bugs are fixed.
 */
export async function migrateExpenseSubcontractLinks(
  supabase: SupabaseClient<Database>,
  siteId?: string
): Promise<{
  updated: number;
  errors: string[];
  details: { source: string; expenseId: string; subcontractId: string }[];
}> {
  const errors: string[] = [];
  const details: { source: string; expenseId: string; subcontractId: string }[] = [];
  let updated = 0;

  try {
    // 1. Fix expenses linked via daily_attendance
    // Find attendance records with both expense_id and subcontract_id
    let dailyQuery = supabase
      .from("daily_attendance")
      .select("expense_id, subcontract_id")
      .not("expense_id", "is", null)
      .not("subcontract_id", "is", null);

    if (siteId) {
      dailyQuery = dailyQuery.eq("site_id", siteId);
    }

    const { data: dailyAttendance, error: dailyError } = await dailyQuery;

    if (dailyError) {
      errors.push(`Error fetching daily_attendance: ${dailyError.message}`);
    } else if (dailyAttendance && dailyAttendance.length > 0) {
      // Batch fetch all expenses that might need updating
      const expenseIds = dailyAttendance
        .filter((r) => r.expense_id && r.subcontract_id)
        .map((r) => r.expense_id)
        .filter((id): id is string => id !== null);

      if (expenseIds.length > 0) {
        // Single query to get all expenses without contract_id
        const { data: expenses } = await supabase
          .from("expenses")
          .select("id, contract_id")
          .in("id", expenseIds)
          .is("contract_id", null);

        if (expenses && expenses.length > 0) {
          // Build map of expense_id -> subcontract_id from attendance records
          const expenseToSubcontract = new Map<string, string>();
          dailyAttendance.forEach((r) => {
            if (r.expense_id && r.subcontract_id) {
              expenseToSubcontract.set(r.expense_id, r.subcontract_id);
            }
          });

          // Prepare batch updates
          const updates = expenses
            .filter((e) => expenseToSubcontract.has(e.id))
            .map((e) => ({
              id: e.id,
              contract_id: expenseToSubcontract.get(e.id)!,
            }));

          // Batch update in parallel using Promise.all
          if (updates.length > 0) {
            const updateResults = await Promise.allSettled(
              updates.map((u) =>
                supabase
                  .from("expenses")
                  .update({ contract_id: u.contract_id })
                  .eq("id", u.id)
              )
            );

            // Track successes and failures
            updateResults.forEach((result, index) => {
              if (result.status === "fulfilled" && !result.value.error) {
                updated++;
                details.push({
                  source: "daily_attendance",
                  expenseId: updates[index].id,
                  subcontractId: updates[index].contract_id,
                });
              } else {
                const error = result.status === "rejected" ? result.reason : result.value.error;
                errors.push(`Error updating expense ${updates[index].id}: ${error?.message || "Unknown error"}`);
              }
            });
          }
        }
      }
    }

    // 2. Fix expenses linked via market_laborer_attendance
    let marketQuery = (supabase
      .from("market_laborer_attendance") as any)
      .select("expense_id, subcontract_id")
      .not("expense_id", "is", null)
      .not("subcontract_id", "is", null);

    if (siteId) {
      marketQuery = marketQuery.eq("site_id", siteId);
    }

    const { data: marketAttendance, error: marketError } = await marketQuery;

    if (marketError) {
      errors.push(`Error fetching market_laborer_attendance: ${marketError.message}`);
    } else if (marketAttendance && marketAttendance.length > 0) {
      // Batch fetch all expenses that might need updating
      const expenseIds = marketAttendance
        .filter((r: any) => r.expense_id && r.subcontract_id)
        .map((r: any) => r.expense_id)
        .filter((id: any): id is string => id !== null);

      if (expenseIds.length > 0) {
        // Single query to get all expenses without contract_id
        const { data: expenses } = await supabase
          .from("expenses")
          .select("id, contract_id")
          .in("id", expenseIds)
          .is("contract_id", null);

        if (expenses && expenses.length > 0) {
          // Build map of expense_id -> subcontract_id from attendance records
          const expenseToSubcontract = new Map<string, string>();
          marketAttendance.forEach((r: any) => {
            if (r.expense_id && r.subcontract_id) {
              expenseToSubcontract.set(r.expense_id, r.subcontract_id);
            }
          });

          // Prepare batch updates
          const updates = expenses
            .filter((e) => expenseToSubcontract.has(e.id))
            .map((e) => ({
              id: e.id,
              contract_id: expenseToSubcontract.get(e.id)!,
            }));

          // Batch update in parallel using Promise.all
          if (updates.length > 0) {
            const updateResults = await Promise.allSettled(
              updates.map((u) =>
                supabase
                  .from("expenses")
                  .update({ contract_id: u.contract_id })
                  .eq("id", u.id)
              )
            );

            // Track successes and failures
            updateResults.forEach((result, index) => {
              if (result.status === "fulfilled" && !result.value.error) {
                updated++;
                details.push({
                  source: "market_laborer_attendance",
                  expenseId: updates[index].id,
                  subcontractId: updates[index].contract_id,
                });
              } else {
                const error = result.status === "rejected" ? result.reason : result.value.error;
                errors.push(`Error updating expense ${updates[index].id}: ${error?.message || "Unknown error"}`);
              }
            });
          }
        }
      }
    }

    // 3. Fix expenses linked via engineer_transaction_id
    // Find expenses with engineer_transaction_id but no contract_id
    let expenseQuery = supabase
      .from("expenses")
      .select("id, engineer_transaction_id, contract_id")
      .not("engineer_transaction_id", "is", null)
      .is("contract_id", null);

    if (siteId) {
      expenseQuery = expenseQuery.eq("site_id", siteId);
    }

    const { data: expenses, error: expenseError } = await expenseQuery;

    if (expenseError) {
      errors.push(`Error fetching expenses: ${expenseError.message}`);
    } else if (expenses && expenses.length > 0) {
      // OPTIMIZED: Batch fetch all transactions instead of N+1 queries
      const transactionIds = expenses
        .map((e) => e.engineer_transaction_id)
        .filter((id): id is string => id !== null);

      if (transactionIds.length > 0) {
        // Single batch query for all transactions
        const { data: transactions } = await (supabase
          .from("site_engineer_transactions") as any)
          .select("id, related_subcontract_id")
          .in("id", transactionIds);

        // Build map of transaction_id -> subcontract_id
        const transactionToSubcontract = new Map<string, string>();
        (transactions || []).forEach((tx: any) => {
          if (tx.related_subcontract_id) {
            transactionToSubcontract.set(tx.id, tx.related_subcontract_id);
          }
        });

        // Prepare batch updates for expenses with matching subcontracts
        const expenseUpdates = expenses
          .filter((e) => e.engineer_transaction_id && transactionToSubcontract.has(e.engineer_transaction_id))
          .map((e) => ({
            id: e.id,
            contract_id: transactionToSubcontract.get(e.engineer_transaction_id!)!,
          }));

        // Batch update using Promise.allSettled
        if (expenseUpdates.length > 0) {
          const updateResults = await Promise.allSettled(
            expenseUpdates.map((u) =>
              supabase
                .from("expenses")
                .update({ contract_id: u.contract_id })
                .eq("id", u.id)
            )
          );

          // Track successes and failures
          updateResults.forEach((result, index) => {
            if (result.status === "fulfilled" && !result.value.error) {
              updated++;
              details.push({
                source: "engineer_transaction",
                expenseId: expenseUpdates[index].id,
                subcontractId: expenseUpdates[index].contract_id,
              });
            } else {
              const error = result.status === "rejected" ? result.reason : result.value.error;
              errors.push(`Error updating expense ${expenseUpdates[index].id}: ${error?.message || "Unknown error"}`);
            }
          });
        }
      }
    }

    return { updated, errors, details };
  } catch (err) {
    console.error("Error in migrateExpenseSubcontractLinks:", err);
    errors.push(`Unexpected error: ${(err as Error).message}`);
    return { updated, errors, details };
  }
}
