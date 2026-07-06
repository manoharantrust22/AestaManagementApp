-- Mesthri commission — Part B, Migration: cross-system double-pay guard.
--
-- On a commission-ENABLED task-work package the crew is paid directly via the company
-- salary week (net), and the maistry gets the accrued commission via a payment_type=
-- 'commission' settlement. So the package's fixed-price crew payouts (part_payment /
-- final_settlement) must be refused — otherwise the crew's labour would be paid twice
-- (once in the company week, once out of the lump sum). Advances (to the maistry) and
-- retention_release are still allowed; any pre-cutover advance must be reconciled by hand.
--
-- (The subcontract side — restricting MestriSettleDialog → processContractPayment crew
-- settles on enabled subcontracts — is enforced in the client, which is the only caller.)

CREATE OR REPLACE FUNCTION public.block_task_work_crew_payout_on_commission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled boolean;
BEGIN
  IF NEW.payment_type IN ('part_payment', 'final_settlement') THEN
    SELECT mesthri_commission_enabled INTO v_enabled
    FROM public.task_work_packages
    WHERE id = NEW.package_id;

    IF COALESCE(v_enabled, false) THEN
      RAISE EXCEPTION
        'This package pays its company laborers directly each week (mesthri commission is on). Crew part-payment / final-settlement on the package is blocked to avoid double-paying — pay the maistry his commission via the salary page instead.'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_block_task_work_crew_payout ON public.task_work_payments;
CREATE TRIGGER trg_block_task_work_crew_payout
  BEFORE INSERT ON public.task_work_payments
  FOR EACH ROW EXECUTE FUNCTION public.block_task_work_crew_payout_on_commission();
