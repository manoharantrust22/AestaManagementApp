-- Weekly Payout Console — the single-transaction fan-out payment + reversal.
--
-- pay_laborer_weekly_payout records ONE hand-to-hand weekly payment to one company
-- laborer as N site-scoped settlement_groups (one per site × bucket), so each site's
-- books stay separate while the laborer receives one total. Buckets:
--   kind='contract'        -> record_contract_laborer_payment (existing clamp)
--   kind='company_salary'  -> settle_company_week_laborer (20260714100200)
-- Both clamp server-side; a bucket clamping to ZERO aborts the whole payout (stale
-- console), a partial clamp records the truth and reports {requested, recorded}.
--
-- Auth mirrors transfer_settlements_to_site (20260708100100): admin/office, or
-- can_access_site() for EVERY bucket site.
--
-- v1 restriction: single payer source per bucket (no payer_source_split) — split
-- validation runs against the pre-clamp total inside create_settlement_group and
-- could disagree with the clamped amount.

CREATE OR REPLACE FUNCTION public.pay_laborer_weekly_payout(
  p_laborer_id uuid,
  p_week_start date,
  p_week_end date,
  p_payment_date date,
  p_payment_mode text,
  p_notes text,
  p_proof_urls text[],
  p_buckets jsonb,
  p_idempotency_key uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id     uuid;
  v_caller_role   user_role;
  v_caller_name   text;
  v_laborer       laborers%ROWTYPE;
  v_batch_id      uuid;
  v_bucket        jsonb;
  v_i             int := 0;
  v_site_id       uuid;
  v_kind          text;
  v_ref_kind      text;
  v_ref_id        uuid;
  v_amount        numeric;
  v_payer_source  text;
  v_payer_name    text;
  v_group_id      uuid;
  v_group_ref     text;
  v_recorded      numeric;
  v_total_rec     numeric := 0;
  v_total_req     numeric := 0;
  v_bucket_key    uuid;
  v_notes         text;
  v_week_label    text;
  v_results       jsonb := '[]'::jsonb;
  v_existing      laborer_payout_batches%ROWTYPE;
BEGIN
  -- 0. Idempotent replay --------------------------------------------------
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM laborer_payout_batches b
    WHERE b.idempotency_key = p_idempotency_key AND b.is_reversed = false;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'batch_id', v_existing.id,
        'total_recorded', v_existing.total_amount,
        'buckets', COALESCE(v_existing.buckets_result, '[]'::jsonb),
        'idempotent_replay', true);
    END IF;
  END IF;

  -- 1. Caller --------------------------------------------------------------
  SELECT u.id, u.role, u.name INTO v_caller_id, v_caller_role, v_caller_name
  FROM users u WHERE u.auth_id = auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: no application user for the current session' USING ERRCODE = '42501';
  END IF;

  -- 2. Inputs ---------------------------------------------------------------
  IF p_buckets IS NULL OR jsonb_typeof(p_buckets) <> 'array' OR jsonb_array_length(p_buckets) = 0 THEN
    RAISE EXCEPTION 'pay_laborer_weekly_payout: p_buckets must be a non-empty array' USING ERRCODE = '22023';
  END IF;
  IF p_week_start IS NULL OR p_week_end IS NULL OR p_week_end < p_week_start THEN
    RAISE EXCEPTION 'pay_laborer_weekly_payout: invalid week range' USING ERRCODE = '22023';
  END IF;
  IF p_payment_date IS NULL THEN
    RAISE EXCEPTION 'pay_laborer_weekly_payout: p_payment_date is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_laborer FROM laborers WHERE id = p_laborer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Laborer not found' USING ERRCODE = '22023';
  END IF;
  IF v_laborer.laborer_type <> 'contract' THEN
    RAISE EXCEPTION 'Weekly payouts cover company laborers only' USING ERRCODE = '22023';
  END IF;

  -- 3. Validate + authorize every bucket ------------------------------------
  FOR v_bucket IN SELECT * FROM jsonb_array_elements(p_buckets) LOOP
    v_site_id := (v_bucket ->> 'site_id')::uuid;
    v_kind    := v_bucket ->> 'kind';
    v_amount  := (v_bucket ->> 'amount')::numeric;

    IF v_site_id IS NULL OR v_kind NOT IN ('company_salary', 'contract') THEN
      RAISE EXCEPTION 'Invalid bucket (site_id/kind): %', v_bucket USING ERRCODE = '22023';
    END IF;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Bucket amounts must be positive: %', v_bucket USING ERRCODE = '22023';
    END IF;
    IF v_bucket ? 'payer_source_split' AND (v_bucket -> 'payer_source_split') IS NOT NULL
       AND jsonb_typeof(v_bucket -> 'payer_source_split') <> 'null' THEN
      RAISE EXCEPTION 'Split payer sources are not supported for weekly payouts (v1)' USING ERRCODE = '22023';
    END IF;

    IF NOT (v_caller_role IN ('admin', 'office') OR public.can_access_site(v_site_id)) THEN
      RAISE EXCEPTION 'Not authorized to record payments on one of the bucket sites' USING ERRCODE = '42501';
    END IF;

    IF v_kind = 'contract' THEN
      v_ref_kind := v_bucket ->> 'contract_ref_kind';
      v_ref_id   := (v_bucket ->> 'contract_ref_id')::uuid;
      IF v_ref_kind NOT IN ('task_work', 'subcontract') OR v_ref_id IS NULL THEN
        RAISE EXCEPTION 'Contract bucket needs contract_ref_kind + contract_ref_id: %', v_bucket USING ERRCODE = '22023';
      END IF;
      IF v_ref_kind = 'task_work' THEN
        IF NOT EXISTS (SELECT 1 FROM task_work_packages t WHERE t.id = v_ref_id AND t.site_id = v_site_id) THEN
          RAISE EXCEPTION 'Task-work package does not belong to the stated site' USING ERRCODE = '22023';
        END IF;
      ELSE
        IF NOT EXISTS (SELECT 1 FROM subcontracts sc WHERE sc.id = v_ref_id AND sc.site_id = v_site_id) THEN
          RAISE EXCEPTION 'Subcontract does not belong to the stated site' USING ERRCODE = '22023';
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- 4. Batch header ----------------------------------------------------------
  INSERT INTO laborer_payout_batches (
    company_id, laborer_id, week_start, week_end, payment_date,
    total_amount, payment_mode, notes, proof_urls,
    created_by, created_by_name, idempotency_key
  ) VALUES (
    v_laborer.company_id, p_laborer_id, p_week_start, p_week_end, p_payment_date,
    0, p_payment_mode, p_notes, p_proof_urls,
    v_caller_id, v_caller_name, p_idempotency_key
  ) RETURNING id INTO v_batch_id;

  v_week_label := to_char(p_week_start, 'DD Mon') || ' – ' || to_char(p_week_end, 'DD Mon');

  -- 5. Fan out, ordered by site then kind/ref (stable advisory-lock order) ---
  FOR v_bucket IN
    SELECT b.value
    FROM jsonb_array_elements(p_buckets) b
    ORDER BY b.value ->> 'site_id', b.value ->> 'kind', b.value ->> 'contract_ref_id'
  LOOP
    v_i := v_i + 1;
    v_site_id      := (v_bucket ->> 'site_id')::uuid;
    v_kind         := v_bucket ->> 'kind';
    v_ref_kind     := v_bucket ->> 'contract_ref_kind';
    v_ref_id       := (v_bucket ->> 'contract_ref_id')::uuid;
    v_amount       := (v_bucket ->> 'amount')::numeric;
    v_payer_source := v_bucket ->> 'payer_source';
    v_payer_name   := v_bucket ->> 'payer_name';
    v_total_req    := v_total_req + v_amount;

    v_bucket_key := CASE
      WHEN p_idempotency_key IS NULL THEN NULL
      ELSE md5(p_idempotency_key::text || ':' || v_i::text)::uuid
    END;

    v_notes := 'Weekly payout ' || v_week_label || ' — ' || v_laborer.name
               || COALESCE('. ' || NULLIF(p_notes, ''), '');

    SELECT g.id, g.settlement_reference INTO v_group_id, v_group_ref
    FROM create_settlement_group(
      p_site_id              => v_site_id,
      p_settlement_date      => p_payment_date,
      p_total_amount         => v_amount,
      p_laborer_count        => 1,
      p_payment_channel      => 'direct',
      p_payment_mode         => p_payment_mode,
      p_payer_source         => v_payer_source,
      p_payer_name           => v_payer_name,
      p_notes                => v_notes,
      p_created_by           => v_caller_id,
      p_created_by_name      => v_caller_name,
      p_payment_type         => 'salary',
      p_actual_payment_date  => p_payment_date,
      p_proof_urls           => p_proof_urls,
      p_idempotency_key      => v_bucket_key
    ) g;

    IF v_kind = 'contract' THEN
      v_recorded := record_contract_laborer_payment(
        v_ref_kind, v_ref_id, p_laborer_id, v_group_id, v_amount);
    ELSE
      v_recorded := settle_company_week_laborer(
        v_site_id, p_laborer_id, p_week_start, p_week_end,
        v_group_id, v_amount, p_payment_date, p_payment_mode,
        v_payer_source, v_payer_name, v_caller_name, v_caller_id);
      IF v_recorded < v_amount THEN
        UPDATE settlement_groups SET total_amount = v_recorded WHERE id = v_group_id;
      END IF;
    END IF;

    IF v_recorded <= 0.005 THEN
      RAISE EXCEPTION 'Nothing left to record for % bucket on this site — amounts changed since the console loaded. Refresh and retry.',
        v_kind USING ERRCODE = 'P0001';
    END IF;

    UPDATE settlement_groups
      SET payout_batch_id = v_batch_id
      WHERE id = v_group_id;

    v_total_rec := v_total_rec + v_recorded;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'site_id', v_site_id,
      'kind', v_kind,
      'ref_kind', v_ref_kind,
      'ref_id', v_ref_id,
      'settlement_group_id', v_group_id,
      'settlement_reference', v_group_ref,
      'requested', v_amount,
      'recorded', v_recorded
    ));
  END LOOP;

  -- 6. Finalize --------------------------------------------------------------
  UPDATE laborer_payout_batches
    SET total_amount = v_total_rec,
        buckets_result = v_results
    WHERE id = v_batch_id;

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'total_requested', v_total_req,
    'total_recorded', v_total_rec,
    'buckets', v_results,
    'idempotent_replay', false);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.pay_laborer_weekly_payout(
  uuid, date, date, date, text, text, text[], jsonb, uuid
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- reverse_laborer_payout — undo the whole batch. Reverses every live child
-- settlement group via reverse_settlement (which un-stamps attendance, cancels
-- the group and NULLs its idempotency key), additionally archives the child
-- labor_payments + payment_week_allocations (reverse_settlement leaves those,
-- and get_multi_site_settlement_report / the pwa arrears math sum them), and
-- releases the batch idempotency key so the payout can be legitimately redone.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_laborer_payout(
  p_batch_id uuid,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id   uuid;
  v_caller_role user_role;
  v_caller_name text;
  v_batch       laborer_payout_batches%ROWTYPE;
  v_group_id    uuid;
  v_count       int := 0;
BEGIN
  SELECT u.id, u.role, u.name INTO v_caller_id, v_caller_role, v_caller_name
  FROM users u WHERE u.auth_id = auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: no application user for the current session' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_batch FROM laborer_payout_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout batch not found' USING ERRCODE = '22023';
  END IF;

  IF v_batch.is_reversed THEN
    RETURN jsonb_build_object('batch_id', p_batch_id, 'already_reversed', true, 'reversed_groups', 0);
  END IF;

  IF NOT (v_caller_role IN ('admin', 'office') OR v_caller_id = v_batch.created_by) THEN
    RAISE EXCEPTION 'Not authorized to reverse this payout' USING ERRCODE = '42501';
  END IF;

  FOR v_group_id IN
    SELECT sg.id FROM settlement_groups sg
    WHERE sg.payout_batch_id = p_batch_id AND sg.is_cancelled = false
  LOOP
    PERFORM reverse_settlement(v_group_id, COALESCE(p_reason, 'Weekly payout reversed'));

    UPDATE payment_week_allocations pwa
      SET is_archived = true
      FROM labor_payments lp
      WHERE lp.id = pwa.labor_payment_id
        AND lp.settlement_group_id = v_group_id
        AND pwa.is_archived = false;

    UPDATE labor_payments
      SET is_archived = true
      WHERE settlement_group_id = v_group_id
        AND is_archived = false;

    v_count := v_count + 1;
  END LOOP;

  UPDATE laborer_payout_batches
    SET is_reversed = true,
        reversed_at = now(),
        reversed_by = v_caller_name,
        reversal_reason = p_reason,
        idempotency_key = NULL
    WHERE id = p_batch_id;

  RETURN jsonb_build_object('batch_id', p_batch_id, 'already_reversed', false, 'reversed_groups', v_count);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reverse_laborer_payout(uuid, text)
  TO authenticated, service_role;
