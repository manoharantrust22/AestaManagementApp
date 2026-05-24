-- Phase 4: extend process_batch_settlement with a payer-source split payload.
--
-- BUILDS ON: 20260516120000_process_batch_settlement_payer_source.sql
-- (the 9-arg signature that captures debtor payer source on the BEXP-* row).
--
-- This migration replaces that overload by:
--   1. Dropping the exact 9-arg signature shipped by 20260516120000
--      (otherwise PG installs the new 10-arg version as a SECOND overload
--      and resolution becomes ambiguous).
--   2. Recreating the function with p_payer_source_split jsonb DEFAULT NULL
--      appended after p_settlement_payer_name.
--
-- Semantics (parallel to settlement_groups, misc_expenses, etc.):
--   p_payer_source_split IS NULL     -> single source path, the BEXP-* row's
--                                        settlement_payer_source/_name fields
--                                        carry the values verbatim.
--   p_payer_source_split IS NOT NULL -> validate via
--                                        validate_payer_source_split(...,
--                                          p_total => v_final_amount,
--                                          p_site_id => p_debtor_site_id)
--                                        then write payer_source='split',
--                                        payer_name=NULL, and persist the
--                                        breakdown JSONB on the BEXP-* row.
--
-- The validator's p_site_id MUST be the debtor site because the BEXP-* row
-- belongs to the debtor (it's the inter-site material expense charged to the
-- site that consumed the batch) and the registry lookup is per-site.

DROP FUNCTION IF EXISTS public.process_batch_settlement(
  text, uuid, text, date, text, numeric, uuid, text, text
);

CREATE OR REPLACE FUNCTION public.process_batch_settlement(
  p_batch_ref_code text,
  p_debtor_site_id uuid,
  p_payment_mode text,
  p_payment_date date,
  p_payment_reference text DEFAULT NULL::text,
  p_settlement_amount numeric DEFAULT NULL::numeric,
  p_created_by uuid DEFAULT NULL::uuid,
  p_settlement_payer_source text DEFAULT NULL::text,
  p_settlement_payer_name text DEFAULT NULL::text,
  p_payer_source_split jsonb DEFAULT NULL::jsonb
)
RETURNS TABLE(settlement_id uuid, debtor_expense_id uuid, settlement_code text)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_batch RECORD;
  v_creditor_site_id UUID;
  v_creditor_site_name TEXT;
  v_debtor_site_name TEXT;
  v_site_group_id UUID;
  v_total_qty NUMERIC;
  v_total_amount NUMERIC;
  v_original_amount NUMERIC;
  v_final_amount NUMERIC;
  v_unit_cost NUMERIC;
  v_settlement_id UUID;
  v_settlement_code TEXT;
  v_debtor_expense_id UUID;
  v_debtor_expense_ref TEXT;
  v_usage_record RECORD;
  v_batch_completed BOOLEAN;
  v_all_settled BOOLEAN;
  v_bill_url TEXT;
  v_self_use_expense_id UUID;
  v_self_use_expense_ref TEXT;
  v_self_use_material RECORD;
  v_year INTEGER;
  v_week_number INTEGER;
  v_period_start DATE;
  v_period_end DATE;
  v_effective_payer_source TEXT;
  v_effective_payer_name TEXT;
BEGIN
  SELECT
    mpe.id, mpe.ref_code, mpe.site_id AS batch_site_id, mpe.paying_site_id,
    mpe.site_group_id, mpe.total_amount, mpe.original_qty, mpe.remaining_qty,
    mpe.used_qty, mpe.self_used_qty, mpe.self_used_amount, mpe.status,
    mpe.bill_url, mpe.purchase_date, s.name AS paying_site_name
  INTO v_batch
  FROM material_purchase_expenses mpe
  JOIN sites s ON s.id = COALESCE(mpe.paying_site_id, mpe.site_id)
  WHERE mpe.ref_code = p_batch_ref_code AND mpe.purchase_type = 'group_stock';

  IF v_batch IS NULL THEN
    RAISE EXCEPTION 'Batch not found or not a group stock batch: %', p_batch_ref_code;
  END IF;

  v_creditor_site_id := COALESCE(v_batch.paying_site_id, v_batch.batch_site_id);
  v_creditor_site_name := v_batch.paying_site_name;
  v_bill_url := v_batch.bill_url;
  v_site_group_id := v_batch.site_group_id;

  SELECT name INTO v_debtor_site_name FROM sites WHERE id = p_debtor_site_id;

  v_year := EXTRACT(YEAR FROM p_payment_date)::INTEGER;
  v_week_number := EXTRACT(WEEK FROM p_payment_date)::INTEGER;
  v_period_start := DATE_TRUNC('week', p_payment_date)::DATE;
  v_period_end := (DATE_TRUNC('week', p_payment_date) + INTERVAL '6 days')::DATE;

  SELECT COALESCE(SUM(quantity), 0), COALESCE(SUM(total_cost), 0)
  INTO v_total_qty, v_total_amount
  FROM batch_usage_records
  WHERE batch_ref_code = p_batch_ref_code
    AND usage_site_id = p_debtor_site_id AND settlement_status = 'pending';

  IF v_total_qty = 0 THEN
    RAISE EXCEPTION 'No pending usage records found for site %', v_debtor_site_name;
  END IF;

  v_original_amount := v_total_amount;
  IF p_settlement_amount IS NOT NULL AND p_settlement_amount > 0 THEN
    v_final_amount := p_settlement_amount;
  ELSE
    v_final_amount := v_total_amount;
  END IF;
  v_unit_cost := v_final_amount / NULLIF(v_total_qty, 0);

  -- Resolve effective payer fields. When a split payload is provided we
  -- validate it against the FINAL settlement amount (post-bargain) and
  -- force payer_source='split' / payer_name=NULL on the BEXP-* row.
  -- p_site_id passes the debtor site because the row being written is
  -- the debtor's BEXP-* and payer_sources is keyed by (site_id, key).
  IF p_payer_source_split IS NOT NULL THEN
    PERFORM validate_payer_source_split(
      p_payer_source_split, v_final_amount, p_debtor_site_id
    );
    v_effective_payer_source := 'split';
    v_effective_payer_name := NULL;
  ELSE
    v_effective_payer_source := p_settlement_payer_source;
    v_effective_payer_name := p_settlement_payer_name;
  END IF;

  v_settlement_code := 'BSET-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 4));

  SELECT id INTO v_settlement_id
  FROM inter_site_material_settlements
  WHERE site_group_id = v_site_group_id AND from_site_id = p_debtor_site_id
    AND to_site_id = v_creditor_site_id AND year = v_year AND week_number = v_week_number;

  IF v_settlement_id IS NOT NULL THEN
    UPDATE inter_site_material_settlements SET
      total_amount = total_amount + v_final_amount, status = 'settled',
      original_calculated_amount = COALESCE(original_calculated_amount, 0) + v_original_amount,
      final_settlement_amount = COALESCE(final_settlement_amount, 0) + v_final_amount,
      batch_ref_code = p_batch_ref_code, bill_url = COALESCE(v_bill_url, bill_url), updated_at = NOW()
    WHERE id = v_settlement_id;
  ELSE
    INSERT INTO inter_site_material_settlements (
      settlement_code, site_group_id, from_site_id, to_site_id,
      year, week_number, period_start, period_end,
      batch_ref_code, total_amount, status,
      original_calculated_amount, final_settlement_amount, bill_url, created_by
    ) VALUES (
      v_settlement_code, v_site_group_id, p_debtor_site_id, v_creditor_site_id,
      v_year, v_week_number, v_period_start, v_period_end,
      p_batch_ref_code, v_final_amount, 'settled',
      v_original_amount, v_final_amount, v_bill_url, p_created_by
    ) RETURNING id INTO v_settlement_id;
  END IF;

  SELECT isms.settlement_code INTO v_settlement_code
  FROM inter_site_material_settlements isms WHERE isms.id = v_settlement_id;

  v_debtor_expense_ref := 'BEXP-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 4));

  -- Phase 4: payer_source_split persisted on the debtor BEXP-* row. When
  -- set, settlement_payer_source carries the 'split' sentinel and
  -- settlement_payer_name is NULL (per-row labels live in the JSONB).
  INSERT INTO material_purchase_expenses (
    site_id, ref_code, purchase_type, vendor_name, purchase_date,
    total_amount, status, is_paid, paid_date, settlement_reference,
    settlement_date, original_batch_code, created_by, notes, bill_url,
    settlement_payer_source, settlement_payer_name, payer_source_split
  ) VALUES (
    p_debtor_site_id, v_debtor_expense_ref, 'own_site',
    v_creditor_site_name || ' (Group Settlement)', p_payment_date,
    v_final_amount, 'recorded', true, p_payment_date, v_settlement_code,
    p_payment_date, p_batch_ref_code, p_created_by,
    'Settled from batch ' || p_batch_ref_code || ' - ' || v_total_qty::text || ' units @ ' || v_unit_cost::text || '/unit' ||
    CASE WHEN v_original_amount <> v_final_amount THEN ' (Original: ' || v_original_amount::text || ', Negotiated: ' || v_final_amount::text || ')' ELSE '' END,
    v_bill_url,
    v_effective_payer_source, v_effective_payer_name, p_payer_source_split
  ) RETURNING id INTO v_debtor_expense_id;

  FOR v_usage_record IN
    SELECT * FROM batch_usage_records
    WHERE batch_ref_code = p_batch_ref_code AND usage_site_id = p_debtor_site_id AND settlement_status = 'pending'
  LOOP
    INSERT INTO material_purchase_expense_items (purchase_expense_id, material_id, brand_id, quantity, unit_price)
    VALUES (v_debtor_expense_id, v_usage_record.material_id, v_usage_record.brand_id, v_usage_record.quantity, v_unit_cost);
  END LOOP;

  UPDATE batch_usage_records SET settlement_status = 'settled', settlement_id = v_settlement_id, updated_at = NOW()
  WHERE batch_ref_code = p_batch_ref_code AND usage_site_id = p_debtor_site_id AND settlement_status = 'pending';

  INSERT INTO settlement_expense_allocations (
    settlement_id, batch_ref_code, creditor_site_id, creditor_expense_id,
    creditor_original_amount, creditor_self_use_amount,
    debtor_site_id, debtor_expense_id, debtor_settled_amount
  ) VALUES (
    v_settlement_id, p_batch_ref_code, v_creditor_site_id, v_batch.id,
    v_batch.total_amount, v_batch.self_used_amount,
    p_debtor_site_id, v_debtor_expense_id, v_final_amount
  );

  SELECT remaining_qty <= 0,
    NOT EXISTS (SELECT 1 FROM batch_usage_records WHERE batch_ref_code = p_batch_ref_code AND settlement_status = 'pending')
  INTO v_batch_completed, v_all_settled
  FROM material_purchase_expenses WHERE ref_code = p_batch_ref_code;

  IF v_batch_completed AND v_all_settled THEN
    UPDATE material_purchase_expenses SET status = 'completed', updated_at = NOW() WHERE ref_code = p_batch_ref_code;

    IF COALESCE(v_batch.self_used_qty, 0) > 0 AND COALESCE(v_batch.self_used_amount, 0) > 0 THEN
      v_self_use_expense_ref := 'SELF-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 4));

      INSERT INTO material_purchase_expenses (
        site_id, ref_code, purchase_type, vendor_name, purchase_date,
        total_amount, status, is_paid, paid_date, settlement_reference,
        settlement_date, original_batch_code, created_by, notes, bill_url
      ) VALUES (
        v_creditor_site_id, v_self_use_expense_ref, 'own_site', 'Self-Use from Group Stock',
        COALESCE(v_batch.purchase_date, CURRENT_DATE), v_batch.self_used_amount, 'recorded', true,
        COALESCE(v_batch.purchase_date, CURRENT_DATE), 'SELF-USE', CURRENT_DATE,
        p_batch_ref_code, p_created_by,
        'Self-use from batch ' || p_batch_ref_code || ' - ' || COALESCE(v_batch.self_used_qty, 0)::text || ' units',
        v_bill_url
      ) RETURNING id INTO v_self_use_expense_id;

      FOR v_self_use_material IN
        SELECT material_id, brand_id, SUM(quantity) as total_qty, AVG(unit_cost) as avg_unit_cost
        FROM batch_usage_records
        WHERE batch_ref_code = p_batch_ref_code AND usage_site_id = v_creditor_site_id AND is_self_use = true
        GROUP BY material_id, brand_id
      LOOP
        INSERT INTO material_purchase_expense_items (purchase_expense_id, material_id, brand_id, quantity, unit_price)
        VALUES (v_self_use_expense_id, v_self_use_material.material_id, v_self_use_material.brand_id,
                v_self_use_material.total_qty, v_self_use_material.avg_unit_cost);
      END LOOP;
    END IF;
  END IF;

  RETURN QUERY SELECT v_settlement_id, v_debtor_expense_id, v_settlement_code;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.process_batch_settlement(
  text, uuid, text, date, text, numeric, uuid, text, text, jsonb
) TO authenticated;

COMMENT ON FUNCTION public.process_batch_settlement(
  text, uuid, text, date, text, numeric, uuid, text, text, jsonb
) IS
  'Process inter-site batch settlement: creates BEXP-* on the debtor + updates batch usage records. Phase 4: accepts optional p_payer_source_split JSONB; when set, validates against validate_payer_source_split(_, v_final_amount, p_debtor_site_id), forces settlement_payer_source=''split''/_name=NULL on the BEXP-* row, and persists the per-source breakdown.';
