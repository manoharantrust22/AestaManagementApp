-- Contract pay console (iteration 2) — one unified payment feed for a contract.
--
-- The pane's Payments section should list ALL money that left the site for this
-- contract, whichever mode it's in:
--   1. maistry lump payments   (task_work_payments)         — lump mode
--   2. per-laborer net settlements (settlement_groups salary, linked to this
--      contract's daily_attendance rows)                    — direct mode
--   3. maistry commission payouts (settlement_groups commission for this maistry)
-- Each row is labelled with the payee so "Paid Hemanta ₹3,600" reads plainly.
-- The client branches on `source` for the reverse/delete path (task_work_payment
-- soft-delete vs reverse_settlement).

CREATE OR REPLACE FUNCTION public.get_contract_payment_history(
  p_kind text,                       -- 'task_work' | 'subcontract'
  p_ref_id uuid
) RETURNS TABLE(
  source text,                       -- 'package_payment' | 'laborer_settlement' | 'commission'
  ref_id uuid,                       -- task_work_payments.id OR settlement_groups.id
  payment_date date,
  amount numeric,
  payee_name text,
  detail text,
  payment_mode text,
  payer_source text,
  payer_name text,
  is_wallet boolean,
  reference text,
  proof_url text
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  -- 1. Maistry lump payments (task-work packages)
  SELECT
    'package_payment'::text,
    twp.id,
    twp.payment_date,
    twp.amount::numeric,
    COALESCE(pkg.maistry_name, 'Maistry')::text,
    'Contract payment'::text,
    twp.payment_mode::text,
    twp.payer_source,
    twp.payer_name,
    (twp.payment_channel = 'engineer_wallet'),
    twp.reference_number,
    twp.proof_url
  FROM public.task_work_payments twp
  JOIN public.task_work_packages pkg ON pkg.id = twp.package_id
  WHERE p_kind = 'task_work'
    AND twp.package_id = p_ref_id
    AND twp.is_deleted = false

  UNION ALL

  -- 2. Per-laborer net settlements linked to this contract's attendance
  SELECT
    'laborer_settlement'::text,
    sg.id,
    COALESCE(sg.actual_payment_date, sg.settlement_date),
    sg.total_amount::numeric,
    COALESCE((
      SELECT l.name
      FROM public.daily_attendance da
      JOIN public.laborers l ON l.id = da.laborer_id
      WHERE da.settlement_group_id = sg.id
      LIMIT 1
    ), 'Laborer')::text,
    'Paid to laborer'::text,
    sg.payment_mode::text,
    sg.payer_source,
    sg.payer_name,
    (sg.payment_channel = 'engineer_wallet'),
    sg.settlement_reference,
    sg.proof_url
  FROM public.settlement_groups sg
  WHERE sg.is_cancelled = false
    AND sg.is_archived = false
    AND sg.payment_type = 'salary'
    AND sg.id IN (
      SELECT DISTINCT da.settlement_group_id
      FROM public.daily_attendance da
      WHERE da.settlement_group_id IS NOT NULL
        AND (
          (p_kind = 'task_work'  AND da.task_work_package_id = p_ref_id)
          OR
          (p_kind = 'subcontract' AND da.subcontract_id = p_ref_id AND da.task_work_package_id IS NULL)
        )
    )

  UNION ALL

  -- 3. Commission payouts to this contract's maistry
  SELECT
    'commission'::text,
    sg.id,
    COALESCE(sg.actual_payment_date, sg.settlement_date),
    sg.total_amount::numeric,
    COALESCE(lb.name, 'Maistry')::text,
    'Maistry commission'::text,
    sg.payment_mode::text,
    sg.payer_source,
    sg.payer_name,
    (sg.payment_channel = 'engineer_wallet'),
    sg.settlement_reference,
    sg.proof_url
  FROM public.settlement_groups sg
  JOIN public.laborers lb ON lb.id = sg.commission_collector_laborer_id
  WHERE sg.is_cancelled = false
    AND sg.is_archived = false
    AND sg.payment_type = 'commission'
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

COMMENT ON FUNCTION public.get_contract_payment_history(text, uuid) IS
  'Unified dated payment feed for one contract: maistry lump payments (task_work_payments) + per-laborer net settlements (settlement_groups linked to the contract''s attendance) + maistry commission payouts. Each row labelled with the payee; client branches on source for the reverse/delete path.';

GRANT EXECUTE ON FUNCTION public.get_contract_payment_history(text, uuid)
  TO authenticated, service_role;
