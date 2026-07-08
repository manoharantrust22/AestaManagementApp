-- Surface the full payment record in the contract payment feed (/site/trades › Payments).
--
-- Two gaps this fixes:
--   1. The feed never returned a LOGGED timestamp (created_at) — only the user-entered
--      payment_date — so there was no way to see WHEN a payment was recorded.
--   2. NOTES typed on a "Contract payment" (maistry lump) were dropped: task_work_payments
--      had no notes column, so for direct/company payments the note vanished, and for wallet
--      payments it only landed on the linked site_engineer_transactions row.
--
-- Fix: add task_work_payments.notes (persisted by createTaskWorkPayment going forward), and
-- extend get_contract_payment_history to also return logged_at, recorded_by, and notes for all
-- three branches. Historical wallet-channel notes are recovered via the wallet-txn join;
-- historical direct notes were never stored and stay blank.

ALTER TABLE public.task_work_payments
  ADD COLUMN IF NOT EXISTS notes text;

-- RETURNS TABLE shape changes → CREATE OR REPLACE can't alter it, so drop first.
DROP FUNCTION IF EXISTS public.get_contract_payment_history(text, uuid);

CREATE FUNCTION public.get_contract_payment_history(p_kind text, p_ref_id uuid)
RETURNS TABLE(source text, ref_id uuid, payment_date date, amount numeric, payee_name text,
              detail text, payment_mode text, payer_source text, payer_name text,
              is_wallet boolean, reference text, proof_url text,
              logged_at timestamptz, recorded_by text, notes text)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  -- 1. Maistry lump payments (task-work packages). notes: prefer the payment's own column
  -- (new/direct); fall back to the linked wallet-spend note to recover historical wallet rows.
  SELECT
    'package_payment'::text, twp.id, twp.payment_date, twp.amount::numeric,
    COALESCE(pkg.maistry_name, 'Maistry')::text, 'Contract payment'::text,
    twp.payment_mode::text, twp.payer_source, twp.payer_name,
    (twp.payment_channel = 'engineer_wallet'), twp.reference_number, twp.proof_url,
    twp.created_at, twp.created_by_name, COALESCE(twp.notes, wtx.notes)
  FROM public.task_work_payments twp
  JOIN public.task_work_packages pkg ON pkg.id = twp.package_id
  LEFT JOIN public.site_engineer_transactions wtx ON wtx.id = twp.engineer_transaction_id
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
    (sg.payment_channel = 'engineer_wallet'), sg.settlement_reference, sg.proof_url,
    sg.created_at, sg.created_by_name, sg.notes
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

  -- 3. Commission payouts to this contract's maistry
  SELECT
    'commission'::text, sg.id,
    COALESCE(sg.actual_payment_date, sg.settlement_date), sg.total_amount::numeric,
    COALESCE(lb.name, 'Maistry')::text, 'Maistry commission'::text,
    sg.payment_mode::text, sg.payer_source, sg.payer_name,
    (sg.payment_channel = 'engineer_wallet'), sg.settlement_reference, sg.proof_url,
    sg.created_at, sg.created_by_name, sg.notes
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

COMMENT ON FUNCTION public.get_contract_payment_history(text, uuid) IS
  'Unified dated payment feed for one contract: maistry lump payments (task_work_payments) + per-laborer net settlements + maistry commission payouts (settlement_groups). Also returns logged_at (created_at), recorded_by (created_by_name), and notes so the pane can show the full record. Each row labelled with the payee; client branches on source for the reverse/delete path.';

GRANT EXECUTE ON FUNCTION public.get_contract_payment_history(text, uuid)
  TO authenticated, service_role;
