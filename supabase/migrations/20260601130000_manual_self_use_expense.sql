-- Migration: make group-batch self-use expense posting MANUAL
--
-- BACKGROUND
-- A group ("cluster") material purchase is meant to stay OUT of all-site expenses
-- until its usage is allocated between sites — only then is each site's share posted
-- as that site's own material expense. When a group batch is consumed entirely by the
-- paying (creditor) site itself (no cross-site usage), the trigger
--   trigger_auto_self_use_on_batch_complete  (AFTER UPDATE ON material_purchase_expenses)
-- fired the moment remaining_qty hit 0 and SILENTLY created a 'SELF-USE' own_site expense
-- via create_self_use_expense_if_needed(). That auto-posting is hard to unwind when data
-- is entered/corrected by hand (the historical-backfill workflow this app is in), so we
-- make it a deliberate, user-initiated action from the Material Hub instead.
--
-- WHAT THIS DOES
-- 1. Drops ONLY the silent batch-complete trigger. The settlement-driven triggers
--    (trigger_auto_self_use_on_settlement_complete / _insert on
--    inter_site_material_settlements) are LEFT INTACT — those fire on an explicit
--    inter-site settlement, where posting the payer's own self-use portion is the
--    correct, expected outcome of a deliberate action.
-- 2. Keeps create_self_use_expense_if_needed() and trigger_fn_auto_self_use_on_batch_complete()
--    in place (no DROP FUNCTION) — the manual path reuses the former, and leaving the
--    trigger function lets us re-enable automation later by recreating the trigger.
-- 3. Adds push_group_self_use_expense(batch_ref) — a thin SECURITY DEFINER wrapper that
--    calls the existing idempotent engine and returns the resulting expense row so the
--    UI can immediately deep-link to it.

-- 1. Stop silent auto-posting on batch completion.
DROP TRIGGER IF EXISTS trigger_auto_self_use_on_batch_complete ON material_purchase_expenses;

-- 2. Manual push wrapper.
--    Reuses create_self_use_expense_if_needed(), which already validates:
--      - batch exists & purchase_type='group_stock'
--      - self_used_qty > 0 AND self_used_amount > 0
--      - batch fully consumed (remaining_qty <= 0) AND no 'pending' cross-site usage
--      - idempotency (no existing SELF-USE expense for this batch)
--    and creates the own_site SELF-USE expense + its items. We then return the row.
CREATE OR REPLACE FUNCTION push_group_self_use_expense(p_batch_ref_code text)
RETURNS TABLE (expense_id uuid, ref_code text, amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Engine does all eligibility checks + the insert (idempotent no-op if already posted).
  PERFORM create_self_use_expense_if_needed(p_batch_ref_code);

  RETURN QUERY
  SELECT e.id, e.ref_code, e.total_amount
  FROM material_purchase_expenses e
  WHERE e.original_batch_code = p_batch_ref_code
    AND e.settlement_reference = 'SELF-USE'
    AND e.purchase_type = 'own_site'
  ORDER BY e.created_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION push_group_self_use_expense(text) TO authenticated;

COMMENT ON FUNCTION push_group_self_use_expense(text) IS
'Manually posts a group batch''s self-use portion as the paying site''s own_site material
expense (settlement_reference=''SELF-USE''). Thin SECURITY DEFINER wrapper around the
idempotent create_self_use_expense_if_needed(); returns the resulting expense
(id, ref_code, amount) so the Hub can deep-link to it. Replaces the silent
trigger_auto_self_use_on_batch_complete trigger (dropped in this migration) with a
deliberate, user-initiated action. Returns no rows if the batch is not eligible.';