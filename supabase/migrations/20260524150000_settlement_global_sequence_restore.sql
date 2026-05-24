-- Restore global per-date sequence on create_settlement_group.
--
-- Regression: 20260523090031_settlement_idempotency_key.sql (idempotency)
-- reintroduced `WHERE sg.site_id = p_site_id` in the MAX/COUNT queries and
-- narrowed the advisory lock to (site + date). 20260524013127_create_settlement_group_split.sql
-- preserved that bug.
--
-- settlement_reference is GLOBALLY UNIQUE across all sites (see settlement_groups
-- table) — so two sites creating settlements on the same date race against each
-- other on the shared reference space. With the per-site MAX scan, site A sees
-- only its own 2 rows (e.g. -001, -002), computes next=3, but site B already
-- owns SET-{date}-003 → unique_violation, retried 3x, function raises:
--   "Failed to create settlement reference after 3 retries. Attempted: SET-...,
--    Existing settlements for this date: 2, Last calculated sequence: 2."
--
-- Fix (re-applies the 20260113130000_fix_global_settlement_sequence.sql intent
-- on top of the current 21-arg signature with idempotency + payer_source_split):
--   1. Lock key derived from settlement_date only (not site + date).
--   2. MAX/COUNT scan all rows for the date, no site_id filter.
--
-- Reference observed pre-fix on prod:
--   SET-260316-001 site 79bfcfb3 (created 2026-03-17 11:32)
--   SET-260316-002 site 79bfcfb3 (created 2026-03-17 12:53)
--   SET-260316-003 site ff893992 (created 2026-03-17 13:29)
-- A 4th attempt from site 79bfcfb3 collided on -003 and surfaced the error.

DROP FUNCTION IF EXISTS create_settlement_group(
  uuid, date, numeric, integer, text, text, text, text, text, text,
  uuid, uuid, uuid, text, text, date, text, jsonb, text[], uuid, jsonb
);

CREATE OR REPLACE FUNCTION create_settlement_group(
  p_site_id uuid,
  p_settlement_date date,
  p_total_amount numeric(12,2),
  p_laborer_count integer,
  p_payment_channel text,
  p_payment_mode text DEFAULT NULL,
  p_payer_source text DEFAULT NULL,
  p_payer_name text DEFAULT NULL,
  p_proof_url text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_subcontract_id uuid DEFAULT NULL,
  p_engineer_transaction_id uuid DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_created_by_name text DEFAULT NULL,
  p_payment_type text DEFAULT 'salary',
  p_actual_payment_date date DEFAULT NULL,
  p_settlement_type text DEFAULT 'date_wise',
  p_week_allocations jsonb DEFAULT NULL,
  p_proof_urls text[] DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL,
  p_payer_source_split jsonb DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  settlement_reference text
)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_date_code TEXT;
  v_next_seq INT;
  v_reference TEXT;
  v_lock_key BIGINT;
  v_new_id UUID;
  v_max_retries INT := 3;
  v_retry_count INT := 0;
  v_existing_count INT;
  v_calculated_max INT;
  v_effective_payer_source TEXT;
  v_effective_payer_name TEXT;
BEGIN
  -- Idempotency: same key returns the original row (safe client-side retry).
  IF p_idempotency_key IS NOT NULL THEN
    SELECT sg.id, sg.settlement_reference
    INTO id, settlement_reference
    FROM settlement_groups sg
    WHERE sg.idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  -- Payer-source split: validate and force payer_source='split', payer_name=NULL.
  IF p_payer_source_split IS NOT NULL THEN
    PERFORM validate_payer_source_split(p_payer_source_split, p_total_amount, p_site_id);
    v_effective_payer_source := 'split';
    v_effective_payer_name := NULL;
  ELSE
    v_effective_payer_source := p_payer_source;
    v_effective_payer_name := p_payer_name;
  END IF;

  -- Lock per DATE only. settlement_reference is globally unique so all sites
  -- creating on the same date must serialize against each other.
  v_lock_key := ('x' || substr(md5(p_settlement_date::text), 1, 8))::bit(32)::int;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  v_date_code := TO_CHAR(p_settlement_date, 'YYMMDD');

  WHILE v_retry_count < v_max_retries LOOP
    BEGIN
      -- Next sequence number across ALL sites for this date.
      SELECT COALESCE(MAX(
        CAST(
          SUBSTRING(sg.settlement_reference FROM 'SET-' || v_date_code || '-(\d+)')
          AS INT
        )
      ), 0) + 1
      INTO v_next_seq
      FROM settlement_groups sg
      WHERE sg.settlement_reference LIKE 'SET-' || v_date_code || '-%'
        AND sg.settlement_reference ~ ('^SET-' || v_date_code || '-\d+$');

      v_calculated_max := v_next_seq - 1;

      SELECT COUNT(DISTINCT sg2.settlement_reference)
      INTO v_existing_count
      FROM settlement_groups sg2
      WHERE sg2.settlement_reference LIKE 'SET-' || v_date_code || '-%'
        AND sg2.settlement_reference ~ ('^SET-' || v_date_code || '-\d+$');

      IF v_calculated_max != v_existing_count AND v_existing_count > 0 THEN
        RAISE WARNING 'Settlement reference mismatch for date %: calculated max=%, actual count=%. Possible sequence gaps or duplicates.',
          p_settlement_date, v_calculated_max, v_existing_count;
      END IF;

      IF v_next_seq < 1000 THEN
        v_reference := 'SET-' || v_date_code || '-' || LPAD(v_next_seq::TEXT, 3, '0');
      ELSE
        v_reference := 'SET-' || v_date_code || '-' || v_next_seq::TEXT;
      END IF;

      v_new_id := gen_random_uuid();

      INSERT INTO settlement_groups (
        id,
        settlement_reference,
        site_id,
        settlement_date,
        total_amount,
        laborer_count,
        payment_channel,
        payment_mode,
        payer_source,
        payer_name,
        proof_url,
        notes,
        subcontract_id,
        engineer_transaction_id,
        created_by,
        created_by_name,
        payment_type,
        actual_payment_date,
        settlement_type,
        week_allocations,
        proof_urls,
        idempotency_key,
        payer_source_split
      ) VALUES (
        v_new_id,
        v_reference,
        p_site_id,
        p_settlement_date,
        p_total_amount,
        p_laborer_count,
        p_payment_channel,
        p_payment_mode,
        v_effective_payer_source,
        v_effective_payer_name,
        p_proof_url,
        p_notes,
        p_subcontract_id,
        p_engineer_transaction_id,
        p_created_by,
        p_created_by_name,
        p_payment_type,
        COALESCE(p_actual_payment_date, p_settlement_date),
        p_settlement_type,
        p_week_allocations,
        p_proof_urls,
        p_idempotency_key,
        p_payer_source_split
      );

      id := v_new_id;
      settlement_reference := v_reference;
      RETURN NEXT;
      RETURN;

    EXCEPTION
      WHEN unique_violation THEN
        v_retry_count := v_retry_count + 1;

        BEGIN
          INSERT INTO settlement_creation_audit (
            site_id,
            settlement_date,
            attempted_reference,
            retry_count,
            error_message,
            error_context
          ) VALUES (
            p_site_id,
            p_settlement_date,
            v_reference,
            v_retry_count,
            'unique_violation on retry ' || v_retry_count,
            jsonb_build_object(
              'calculated_max', v_calculated_max,
              'existing_count', v_existing_count,
              'next_seq', v_next_seq,
              'date_code', v_date_code,
              'idempotency_key', p_idempotency_key
            )
          );
        EXCEPTION
          WHEN OTHERS THEN
            RAISE WARNING 'Failed to write audit log: %', SQLERRM;
        END;

        IF v_retry_count >= v_max_retries THEN
          RAISE EXCEPTION 'Failed to create settlement reference after % retries. Attempted: %, Existing settlements for this date: %, Last calculated sequence: %.',
            v_max_retries,
            v_reference,
            v_existing_count,
            v_calculated_max
          USING HINT = format('Site: %s, Date: %s, Retry count: %s', p_site_id, p_settlement_date, v_retry_count);
        END IF;

        RAISE WARNING 'Settlement reference % already exists, retrying (attempt %/%)',
          v_reference, v_retry_count, v_max_retries;

        PERFORM pg_sleep(0.01 * v_retry_count);
    END;
  END LOOP;

  RAISE EXCEPTION 'Unexpected error in settlement creation loop';
END;
$$;

GRANT EXECUTE ON FUNCTION create_settlement_group TO authenticated;
GRANT EXECUTE ON FUNCTION create_settlement_group TO service_role;

COMMENT ON FUNCTION create_settlement_group IS
  'Atomically creates a settlement_group with globally-unique sequential reference (SET-YYMMDD-NNN). Per-date advisory lock + per-date MAX scan ensure correctness across multiple sites creating on the same date. Supports idempotency (p_idempotency_key) and payer-source split (p_payer_source_split). Built on 20260524013127 (split) + 20260523090031 (idempotency) + 20260113130000 (v3.0 global sequence).';
