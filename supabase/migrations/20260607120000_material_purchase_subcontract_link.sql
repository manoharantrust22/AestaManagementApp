-- Link a material settlement to a subcontract.
--
-- Some materials are bought *under* a subcontract (e.g. a turnkey civil
-- contract where the contractor's material spend counts against the contract
-- value). Until now material_purchase_expenses had no way to record this, so
-- those costs showed as "Unlinked" on /site/expenses and never rolled into the
-- subcontract's spend.
--
-- This adds an optional subcontract_id. Linking is opt-in (default NULL), so no
-- existing subcontract balance changes unless a user explicitly links a row.
-- Additive / non-destructive.

-- ON DELETE SET NULL: the link is opt-in and non-load-bearing, so removing a
-- subcontract should just unlink its materials, not block the delete.
ALTER TABLE material_purchase_expenses
  ADD COLUMN IF NOT EXISTS subcontract_id UUID REFERENCES subcontracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mpe_subcontract_id
  ON material_purchase_expenses (subcontract_id)
  WHERE subcontract_id IS NOT NULL;

COMMENT ON COLUMN material_purchase_expenses.subcontract_id IS
  'Optional link to the subcontract this material was bought under. When set on a paid row, the amount (COALESCE(amount_paid, total_amount)) counts toward that subcontract''s spend/balance. NULL = unlinked site expense (the default).';
