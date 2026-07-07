-- Contract pay console (iteration 2) — extend the double-pay guard to 'advance'.
--
-- Payment controls were unified: every maistry/package payment now writes
-- payment_type='advance' (no more Advance/Part/Settle distinction). In DIRECT-PAY
-- mode the crew is paid per-laborer inside the pane and the maistry gets his
-- commission + own wages there too — so NO lump/package payment to the maistry
-- should be recorded, or the same labour is paid twice. Previously the guard only
-- blocked part_payment / final_settlement; now that advance is the canonical type,
-- block it as well. retention_release stays allowed (it's not a crew-wage payout).

CREATE OR REPLACE FUNCTION public.block_task_work_crew_payout_on_commission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled boolean;
BEGIN
  IF NEW.payment_type IN ('advance', 'part_payment', 'final_settlement') THEN
    SELECT mesthri_commission_enabled INTO v_enabled
    FROM public.task_work_packages
    WHERE id = NEW.package_id;

    IF COALESCE(v_enabled, false) THEN
      RAISE EXCEPTION
        'This contract pays its company laborers directly (mesthri commission is on). Lump/package payments to the maistry are blocked to avoid double-paying — pay each laborer their net, and the maistry his own wages + commission, from the crew ledger instead.'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Trigger already exists from 20260705130300; the function body above is replaced in place.
