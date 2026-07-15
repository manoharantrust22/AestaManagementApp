-- Block lump contract payments on a section whose money lives in its packages.
--
-- A section (subcontracts row) with total_value = 0 that holds fixed-price
-- task_work_packages has no money identity of its own — every rupee agreed is
-- on the packages. A subcontract_payments row recorded against such a section
-- can never reconcile against anything ("OVERPAID ₹8,000 paid of ₹0") and
-- bypasses the package's own guards (direct-pay packages already block lump
-- payments via block_task_work_crew_payout_on_commission).
--
-- The UI redirects Record into the package pay surfaces; this trigger is the
-- backstop for any other write path. Sections with their own value (hybrid)
-- are untouched. Soft-deleting existing bad rows keeps working: an UPDATE that
-- only sets is_deleted never touches contract_id, so the trigger doesn't fire,
-- and rows arriving already soft-deleted pass through.

CREATE OR REPLACE FUNCTION public.block_section_payment_when_packages()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_total_value numeric;
  v_pkg_count   int;
BEGIN
  IF NEW.is_deleted IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT total_value INTO v_total_value
    FROM public.subcontracts
   WHERE id = NEW.contract_id;

  IF COALESCE(v_total_value, 0) = 0 THEN
    SELECT COUNT(*) INTO v_pkg_count
      FROM public.task_work_packages
     WHERE parent_subcontract_id = NEW.contract_id
       AND status <> 'cancelled';

    IF v_pkg_count > 0 THEN
      RAISE EXCEPTION
        'This section''s money lives in its fixed-price packages — record the payment inside the package: each laborer from the crew ledger when the crew is paid directly, or a package payment otherwise.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_block_section_payment_when_packages ON public.subcontract_payments;
CREATE TRIGGER trg_block_section_payment_when_packages
  BEFORE INSERT OR UPDATE OF contract_id ON public.subcontract_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.block_section_payment_when_packages();

COMMENT ON FUNCTION public.block_section_payment_when_packages() IS
  'Rejects subcontract_payments on a zero-value subcontract that holds non-cancelled task_work_packages (ERRCODE 23514). Rows with is_deleted=true pass through so cleanup/journal writes keep working.';
