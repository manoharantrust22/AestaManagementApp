-- Backfill original_qty for material_purchase_expenses where it's NULL
-- This is needed for batch_unit_cost calculation in shared stock

-- Step 1: Backfill from material_purchase_expense_items (sum of quantities)
UPDATE material_purchase_expenses mpe
SET original_qty = (
  SELECT COALESCE(SUM(quantity), 0)
  FROM material_purchase_expense_items
  WHERE purchase_expense_id = mpe.id
)
WHERE original_qty IS NULL
AND EXISTS (
  SELECT 1
  FROM material_purchase_expense_items
  WHERE purchase_expense_id = mpe.id
);

-- Step 2: For records still NULL (no items), try to infer from remaining_qty
-- (assuming no usage has occurred yet, remaining_qty = original_qty)
UPDATE material_purchase_expenses
SET original_qty = remaining_qty
WHERE original_qty IS NULL
AND remaining_qty IS NOT NULL
AND remaining_qty > 0;

-- Step 3: Add helpful indexes for batch cost lookups (if not already exist)
CREATE INDEX IF NOT EXISTS idx_material_purchase_expenses_ref_code
ON material_purchase_expenses(ref_code)
WHERE ref_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_material_purchase_expenses_site_group
ON material_purchase_expenses(site_group_id)
WHERE site_group_id IS NOT NULL;

-- Step 4: Add a comment explaining the importance of original_qty
COMMENT ON COLUMN material_purchase_expenses.original_qty IS
'Total quantity originally purchased. Required for calculating batch_unit_cost (total_amount / original_qty) for shared stock pricing.';
