-- Settlement audit trail for material_purchase_expenses.
--
-- WHY: a settled material expense showed on the Hub as "SETTLED" with no record
-- of WHO settled it or WHEN — the table only had created_by/created_at and a
-- paid_date (a date, not a timestamp), and (unlike the usage tables) it had no
-- audit trigger at all. Money-bearing rows must be attributable and journaled.
--
-- This migration:
--   1. Adds settled_by (auth user) + settled_at (timestamp), auto-stamped the
--      moment is_paid flips true — covers EVERY entry point (dialog, advance
--      path, spot RPC, batch settlement) because it's enforced in the DB.
--   2. Backfills settled_at = paid_date for existing paid rows (settled_by left
--      NULL — the historical settler is unknown).
--   3. Attaches the existing best-effort audit_row_changes() trigger so every
--      settle/edit/delete is journaled to audit_log (recoverable like the usage
--      tables, per 20260614120000).

ALTER TABLE public.material_purchase_expenses
  ADD COLUMN IF NOT EXISTS settled_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS settled_at timestamptz;

COMMENT ON COLUMN public.material_purchase_expenses.settled_by IS
'auth.users id of the user who marked this expense paid (auto-stamped). Join to public.users via auth_id for the name.';
COMMENT ON COLUMN public.material_purchase_expenses.settled_at IS
'Timestamp the expense was first marked paid (auto-stamped). Distinct from paid_date (the business date).';

-- Backfill BEFORE attaching the audit trigger so we don't spam audit_log and so
-- the AFTER trigger doesn't double-fire on the backfill.
UPDATE public.material_purchase_expenses
SET settled_at = paid_date::timestamptz
WHERE is_paid IS TRUE AND settled_at IS NULL AND paid_date IS NOT NULL;

-- Auto-stamp settled_by/settled_at on the is_paid false->true transition.
CREATE OR REPLACE FUNCTION public.mpe_stamp_settled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.is_paid IS TRUE
     AND (TG_OP = 'INSERT' OR OLD.is_paid IS DISTINCT FROM TRUE)
     AND NEW.settled_at IS NULL THEN
    NEW.settled_at := now();
    NEW.settled_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_mpe_stamp_settled ON public.material_purchase_expenses;
CREATE TRIGGER trg_mpe_stamp_settled
BEFORE INSERT OR UPDATE ON public.material_purchase_expenses
FOR EACH ROW EXECUTE FUNCTION public.mpe_stamp_settled();

-- Journal every change (reuses the best-effort auditor from 20260614120000).
DROP TRIGGER IF EXISTS trg_audit_material_purchase_expenses ON public.material_purchase_expenses;
CREATE TRIGGER trg_audit_material_purchase_expenses
AFTER INSERT OR UPDATE OR DELETE ON public.material_purchase_expenses
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();
