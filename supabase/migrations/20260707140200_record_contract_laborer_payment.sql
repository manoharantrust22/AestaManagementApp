-- Retire the day-based settle (only settlementService called it; no other DB/client caller).
DROP FUNCTION IF EXISTS public.settle_contract_laborer(
  text, uuid, uuid, date, date, uuid, boolean, date, text, text, uuid, text, text, text, text);

-- Record a RUPEE payment against one contract laborer's dues. Clamps to the live remaining
-- (net earned - already-paid, project-wide) so net can never go negative, links the passed
-- settlement_group to (contract, laborer), and sets its total_amount to the recorded amount.
-- No day marking / no commission snapshot (commission stays live).
CREATE OR REPLACE FUNCTION public.record_contract_laborer_payment(
  p_kind text, p_ref_id uuid, p_laborer_id uuid,
  p_settlement_group_id uuid, p_amount numeric
) RETURNS numeric
LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  v_net_owed numeric;
  v_already_paid numeric;
  v_remaining numeric;
  v_record numeric;
BEGIN
  SELECT COALESCE(SUM(d.daily_earnings
           - COALESCE(d.mesthri_commission_amount, vc.commission_amount)), 0)
  INTO v_net_owed
  FROM public.daily_attendance d
  JOIN public.laborers l ON l.id = d.laborer_id
  JOIN public.v_daily_attendance_commission vc ON vc.attendance_id = d.id
  WHERE d.laborer_id = p_laborer_id
    AND d.is_deleted = false AND d.is_archived = false
    AND l.laborer_type = 'contract'
    AND (
      (p_kind = 'task_work'  AND d.task_work_package_id = p_ref_id)
      OR
      (p_kind = 'subcontract' AND d.subcontract_id = p_ref_id AND d.task_work_package_id IS NULL)
    );

  SELECT COALESCE(SUM(sg.total_amount), 0)
  INTO v_already_paid
  FROM public.settlement_groups sg
  WHERE sg.contract_ref_kind = p_kind
    AND sg.contract_ref_id = p_ref_id
    AND sg.contract_laborer_id = p_laborer_id
    AND sg.id <> p_settlement_group_id
    AND sg.is_cancelled = false
    AND sg.is_archived = false;

  v_remaining := GREATEST(v_net_owed - v_already_paid, 0);
  v_record := LEAST(GREATEST(p_amount, 0), v_remaining);

  UPDATE public.settlement_groups
    SET contract_ref_kind   = p_kind,
        contract_ref_id     = p_ref_id,
        contract_laborer_id = p_laborer_id,
        total_amount        = v_record
    WHERE id = p_settlement_group_id;

  RETURN v_record;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.record_contract_laborer_payment(text, uuid, uuid, uuid, numeric)
  TO authenticated, service_role;
