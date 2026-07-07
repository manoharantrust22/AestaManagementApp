-- Contract pay console (iteration 2) — per-laborer in-pane settlement.
--
-- Direct-pay mode pays each company laborer their NET directly from the contract
-- pane (not the site-wide weekly page). This RPC settles ONE laborer's unpaid days
-- on ONE contract over a window, at net, writing the commission snapshot for crew
-- days so the accrual to the maistry locks. Mirrors settle_company_week_contract's
-- payment fields exactly; server-authoritative amount (returns Σ net) so the client
-- can't over/under-pay. Reversal reuses reverse_settlement (clears the snapshot).
--
-- Net per row = daily_earnings - COALESCE(snapshot, live estimate). For the maistry's
-- OWN days (not a crew day) commission is 0 → net = gross, no snapshot written.

CREATE OR REPLACE FUNCTION public.settle_contract_laborer(
  p_kind text,                       -- 'task_work' | 'subcontract'
  p_ref_id uuid,
  p_laborer_id uuid,
  p_date_from date,
  p_date_to date,
  p_settlement_group_id uuid,
  p_is_paid boolean,
  p_payment_date date,
  p_payment_mode text,
  p_paid_via text,
  p_engineer_transaction_id uuid,
  p_payment_proof_url text,
  p_payment_notes text,
  p_payer_source text,
  p_payer_name text
) RETURNS TABLE(rows_settled integer, total_net numeric)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH cand AS (
    SELECT
      d.id,
      d.daily_earnings,
      vc.is_commission_crew_day,
      vc.commission_amount,
      vc.collector_id
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    JOIN public.v_daily_attendance_commission vc ON vc.attendance_id = d.id
    WHERE d.laborer_id = p_laborer_id
      AND d.is_paid = false
      AND d.is_deleted = false
      AND d.is_archived = false
      AND l.laborer_type = 'contract'
      AND (p_date_from IS NULL OR d.date >= p_date_from)
      AND (p_date_to   IS NULL OR d.date <= p_date_to)
      AND (
        (p_kind = 'task_work'  AND d.task_work_package_id = p_ref_id)
        OR
        (p_kind = 'subcontract' AND d.subcontract_id = p_ref_id AND d.task_work_package_id IS NULL)
      )
  ),
  upd AS (
    UPDATE public.daily_attendance d
      SET is_paid = p_is_paid,
          payment_date = p_payment_date,
          payment_mode = p_payment_mode,
          paid_via = p_paid_via,
          engineer_transaction_id = p_engineer_transaction_id,
          payment_proof_url = p_payment_proof_url,
          payment_notes = p_payment_notes,
          payer_source = p_payer_source,
          payer_name = p_payer_name,
          settlement_group_id = p_settlement_group_id,
          mesthri_commission_amount =
            CASE WHEN c.is_commission_crew_day THEN c.commission_amount ELSE NULL END,
          mesthri_commission_collector_id =
            CASE WHEN c.is_commission_crew_day THEN c.collector_id ELSE NULL END
      FROM cand c
      WHERE d.id = c.id
      RETURNING (c.daily_earnings - COALESCE(c.commission_amount, 0)) AS net
  )
  SELECT COUNT(*)::int, COALESCE(SUM(net), 0)::numeric FROM upd;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.settle_contract_laborer(
  text, uuid, uuid, date, date, uuid, boolean, date, text, text, uuid, text, text, text, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.settle_contract_laborer(text, uuid, uuid, date, date, uuid, boolean, date, text, text, uuid, text, text, text, text) IS
  'Settles one company laborer''s unpaid days on one contract (task_work package or subcontract) over a window, at NET, writing the commission snapshot for crew days. Returns rows_settled + Σ net (server-authoritative amount). Reverses via reverse_settlement.';
