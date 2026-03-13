-- Migration: Auto-create self-use expense when group stock batch is fully consumed
-- Fixes: Batches with 100% self-use never get self-use expenses because
-- the existing trigger only fires on inter_site_material_settlements changes.
-- For batches where all usage is by the paying site (self-use), there's no
-- inter-site settlement, so the trigger never fires.

-- =====================================================
-- TRIGGER FUNCTION: auto_self_use_on_batch_complete
-- Called when a group_stock batch's remaining_qty reaches 0
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_fn_auto_self_use_on_batch_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only for group_stock batches that just became fully consumed
  IF NEW.purchase_type = 'group_stock'
     AND COALESCE(NEW.remaining_qty, 0) <= 0
     AND (OLD.remaining_qty IS NULL OR OLD.remaining_qty > 0)
  THEN
    PERFORM create_self_use_expense_if_needed(NEW.ref_code);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_self_use_on_batch_complete ON material_purchase_expenses;

CREATE TRIGGER trigger_auto_self_use_on_batch_complete
AFTER UPDATE ON material_purchase_expenses
FOR EACH ROW
WHEN (NEW.purchase_type = 'group_stock' AND COALESCE(NEW.remaining_qty, 0) <= 0)
EXECUTE FUNCTION trigger_fn_auto_self_use_on_batch_complete();


-- =====================================================
-- BACKFILL: Create missing self-use expenses for completed batches
-- =====================================================

DO $$
DECLARE
  v_batch RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_batch IN
    SELECT ref_code
    FROM material_purchase_expenses
    WHERE purchase_type = 'group_stock'
      AND remaining_qty <= 0
      AND COALESCE(self_used_qty, 0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM material_purchase_expenses e2
        WHERE e2.original_batch_code = material_purchase_expenses.ref_code
          AND e2.settlement_reference = 'SELF-USE'
      )
  LOOP
    PERFORM create_self_use_expense_if_needed(v_batch.ref_code);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'Backfilled self-use expenses for % batches', v_count;
END;
$$;


-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
