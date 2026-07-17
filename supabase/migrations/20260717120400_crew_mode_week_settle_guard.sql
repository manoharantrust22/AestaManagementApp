-- Crew weekly pay — Part 5: write-path guard for whole-week gross settles.
--
-- Read exclusion ⇒ write guard (project invariant): once a site is in crew mode,
-- post-cutover crew days are owed PER LABORER at net (company_week_laborer_unpaid,
-- 20260717120300). The whole-week settle path (processWeeklySettlement →
-- settle_company_week_contract) must therefore never stamp is_paid=true on those
-- days at gross, or the same day would be payable twice. Pre-cutover days stay
-- settleable as before (they are still plain waterfall weeks).
--
-- Bodies reproduce 20260707130000 with ONE added predicate per branch:
--   NOT EXISTS (SELECT 1 FROM crew_pay_config(d.site_id) cc WHERE d.date >= cc.effective_from)
-- Sites without a crew config are byte-for-byte unchanged (config returns no row).

CREATE OR REPLACE FUNCTION public.company_week_contract_net(
  p_site_id uuid,
  p_date_from date,
  p_date_to date,
  p_subcontract_id uuid DEFAULT NULL
) RETURNS TABLE(net numeric, cnt integer)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(SUM(d.daily_earnings), 0)::numeric,
    COUNT(*)::int
  FROM public.daily_attendance d
  JOIN public.laborers l ON l.id = d.laborer_id
  JOIN public.v_daily_attendance_commission vc ON vc.attendance_id = d.id
  WHERE d.site_id = p_site_id
    AND d.date BETWEEN p_date_from AND p_date_to
    AND d.is_paid = false
    AND d.is_deleted = false
    AND d.is_archived = false
    AND l.laborer_type = 'contract'
    -- crew mode: post-cutover days are settled per laborer, never as a gross week
    AND NOT EXISTS (
      SELECT 1 FROM public.crew_pay_config(d.site_id) cc
      WHERE d.date >= cc.effective_from)
    AND (
      (p_subcontract_id IS NOT NULL
         AND d.subcontract_id = p_subcontract_id
         AND NOT vc.is_commission_crew_day
         AND NOT vc.is_commission_mesthri_own_day)
      OR
      (p_subcontract_id IS NULL
         AND d.task_work_package_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.subcontracts sc
           JOIN public.labor_categories lc ON lc.id = sc.trade_category_id
           WHERE sc.id = d.subcontract_id AND lc.name <> 'Civil')
         AND NOT vc.is_commission_crew_day
         AND NOT vc.is_commission_mesthri_own_day)
    );
$function$;

GRANT EXECUTE ON FUNCTION public.company_week_contract_net(uuid, date, date, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.settle_company_week_contract(
  p_site_id uuid,
  p_date_from date,
  p_date_to date,
  p_subcontract_id uuid,
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
      d.daily_earnings
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    JOIN public.v_daily_attendance_commission vc ON vc.attendance_id = d.id
    WHERE d.site_id = p_site_id
      AND d.date BETWEEN p_date_from AND p_date_to
      AND d.is_paid = false
      AND d.is_deleted = false
      AND d.is_archived = false
      AND l.laborer_type = 'contract'
      -- crew mode: post-cutover days are settled per laborer, never as a gross week
      AND NOT EXISTS (
        SELECT 1 FROM public.crew_pay_config(d.site_id) cc
        WHERE d.date >= cc.effective_from)
      AND (
        (p_subcontract_id IS NOT NULL
           AND d.subcontract_id = p_subcontract_id
           AND NOT vc.is_commission_crew_day
           AND NOT vc.is_commission_mesthri_own_day)
        OR
        (p_subcontract_id IS NULL
           AND d.task_work_package_id IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM public.subcontracts sc
             JOIN public.labor_categories lc ON lc.id = sc.trade_category_id
             WHERE sc.id = d.subcontract_id AND lc.name <> 'Civil')
           AND NOT vc.is_commission_crew_day
           AND NOT vc.is_commission_mesthri_own_day)
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
          mesthri_commission_amount = NULL,
          mesthri_commission_collector_id = NULL
      FROM cand c
      WHERE d.id = c.id
      RETURNING c.daily_earnings AS net
  )
  SELECT COUNT(*)::int, COALESCE(SUM(net), 0)::numeric FROM upd;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.settle_company_week_contract(
  uuid, date, date, uuid, uuid, boolean, date, text, text, uuid, text, text, text, text
) TO authenticated, service_role;
