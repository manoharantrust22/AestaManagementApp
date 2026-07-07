-- Extend the payment feed's laborer_settlement branch to find rupee credits via the new link
-- columns OR the legacy day-join (none exist today). Branches 1 (maistry lump) and 3 (commission)
-- are unchanged.
CREATE OR REPLACE FUNCTION public.get_contract_payment_history(p_kind text, p_ref_id uuid)
RETURNS TABLE(source text, ref_id uuid, payment_date date, amount numeric, payee_name text,
              detail text, payment_mode text, payer_source text, payer_name text,
              is_wallet boolean, reference text, proof_url text)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  -- 1. Maistry lump payments (task-work packages)
  SELECT
    'package_payment'::text, twp.id, twp.payment_date, twp.amount::numeric,
    COALESCE(pkg.maistry_name, 'Maistry')::text, 'Contract payment'::text,
    twp.payment_mode::text, twp.payer_source, twp.payer_name,
    (twp.payment_channel = 'engineer_wallet'), twp.reference_number, twp.proof_url
  FROM public.task_work_payments twp
  JOIN public.task_work_packages pkg ON pkg.id = twp.package_id
  WHERE p_kind = 'task_work' AND twp.package_id = p_ref_id AND twp.is_deleted = false

  UNION ALL

  -- 2. Per-laborer rupee settlements: linked via contract columns (new) OR day-join (legacy)
  SELECT
    'laborer_settlement'::text, sg.id,
    COALESCE(sg.actual_payment_date, sg.settlement_date), sg.total_amount::numeric,
    COALESCE(
      ll.name,
      (SELECT l.name FROM public.daily_attendance da
         JOIN public.laborers l ON l.id = da.laborer_id
        WHERE da.settlement_group_id = sg.id LIMIT 1),
      'Laborer')::text,
    'Paid to laborer'::text,
    sg.payment_mode::text, sg.payer_source, sg.payer_name,
    (sg.payment_channel = 'engineer_wallet'), sg.settlement_reference, sg.proof_url
  FROM public.settlement_groups sg
  LEFT JOIN public.laborers ll ON ll.id = sg.contract_laborer_id
  WHERE sg.is_cancelled = false AND sg.is_archived = false AND sg.payment_type = 'salary'
    AND (
      (sg.contract_ref_kind = p_kind AND sg.contract_ref_id = p_ref_id)
      OR sg.id IN (
        SELECT DISTINCT da.settlement_group_id
        FROM public.daily_attendance da
        WHERE da.settlement_group_id IS NOT NULL
          AND (
            (p_kind = 'task_work'  AND da.task_work_package_id = p_ref_id)
            OR (p_kind = 'subcontract' AND da.subcontract_id = p_ref_id AND da.task_work_package_id IS NULL)
          )
      )
    )

  UNION ALL

  -- 3. Commission payouts to this contract's maistry (unchanged)
  SELECT
    'commission'::text, sg.id,
    COALESCE(sg.actual_payment_date, sg.settlement_date), sg.total_amount::numeric,
    COALESCE(lb.name, 'Maistry')::text, 'Maistry commission'::text,
    sg.payment_mode::text, sg.payer_source, sg.payer_name,
    (sg.payment_channel = 'engineer_wallet'), sg.settlement_reference, sg.proof_url
  FROM public.settlement_groups sg
  JOIN public.laborers lb ON lb.id = sg.commission_collector_laborer_id
  WHERE sg.is_cancelled = false AND sg.is_archived = false AND sg.payment_type = 'commission'
    AND sg.commission_collector_laborer_id = (
      CASE
        WHEN p_kind = 'task_work' THEN
          (SELECT maistry_laborer_id FROM public.task_work_packages WHERE id = p_ref_id)
        WHEN p_kind = 'subcontract' THEN
          (SELECT CASE sc.contract_type
             WHEN 'mesthri'    THEN tm.leader_laborer_id
             WHEN 'specialist' THEN sc.laborer_id
             ELSE NULL END
           FROM public.subcontracts sc
           LEFT JOIN public.teams tm ON tm.id = sc.team_id
           WHERE sc.id = p_ref_id)
      END
    )

  ORDER BY 3 DESC;
$function$;
