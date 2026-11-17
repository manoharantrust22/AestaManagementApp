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

