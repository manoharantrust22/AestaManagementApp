-- Migration: Add idempotency_key to settlement_groups
-- Problem: processSettlement() calls create_settlement_group() and if the network response
-- is lost, the retry path creates a SECOND settlement_groups row. The first (already
-- committed) has no attendance links and appears as "Unlinked Salary" on /site/expenses.
-- Fix: Client generates a UUID once before the first attempt; all retries pass the same
-- key. The RPC returns the existing row on conflict instead of creating a duplicate.

-- =============================================================================
-- STEP 1: Add idempotency_key column to settlement_groups
-- =============================================================================

ALTER TABLE settlement_groups
  ADD COLUMN IF NOT EXISTS idempotency_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS settlement_groups_idempotency_key_key
  ON settlement_groups (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN settlement_groups.idempotency_key IS
  'Client-generated UUID passed on all retry attempts. If set, the RPC returns the '
  'existing row instead of inserting a new one. Prevents orphaned settlement_groups '
  'from network-retry double-creation (which show as Unlinked Salary expenses).';

-- =============================================================================
-- STEP 2: Replace create_settlement_group with idempotency-aware version
-- =============================================================================

DROP FUNCTION IF EXISTS create_settlement_group(
  uuid, date, numeric, integer, text, text, text, text, text, text,
  uuid, uuid, uuid, text, text, date, text, jsonb, text[]
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
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  settlement_reference text
)
LANGUAGE plpgsql
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
BEGIN
  -- =========================================================================
  -- IDEMPOTENCY CHECK: Return existing row if key was already committed
  -- =========================================================================
  -- Handles the scenario where the RPC committed but the network response was
  -- lost. The client retries with the same key and gets back the original row.
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

  -- =========================================================================
  -- ADVISORY LOCK: Per site + date to prevent concurrent sequence collisions
  -- =========================================================================
  v_lock_key := ('x' || substr(md5(p_site_id::text || p_settlement_date::text), 1, 8))::bit(32)::int;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  v_date_code := TO_CHAR(p_settlement_date, 'YYMMDD');

  -- =========================================================================
  -- RETRY LOOP: Handle unique_violation on settlement_reference
  -- =========================================================================
  WHILE v_retry_count < v_max_retries LOOP
    BEGIN
      -- Next sequence number for this site + date
      SELECT COALESCE(MAX(
        CAST(
          SUBSTRING(sg.settlement_reference FROM 'SET-' || v_date_code || '-(\d+)')
          AS INT
        )
      ), 0) + 1
      INTO v_next_seq
      FROM settlement_groups sg
      WHERE sg.site_id = p_site_id
        AND sg.settlement_reference LIKE 'SET-' || v_date_code || '-%'
        AND sg.settlement_reference ~ ('^SET-' || v_date_code || '-\d+$');

      v_calculated_max := v_next_seq - 1;

      SELECT COUNT(DISTINCT sg2.settlement_reference)
      INTO v_existing_count
      FROM settlement_groups sg2
      WHERE sg2.site_id = p_site_id
        AND sg2.settlement_reference LIKE 'SET-' || v_date_code || '-%'
        AND sg2.settlement_reference ~ ('^SET-' || v_date_code || '-\d+$');

      IF v_calculated_max != v_existing_count AND v_existing_count > 0 THEN
        RAISE WARNING 'Settlement reference mismatch for site % date %: calculated max=%, actual count=%. Possible sequence gaps or duplicates.',
          p_site_id, p_settlement_date, v_calculated_max, v_existing_count;
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
        idempotency_key
      ) VALUES (
        v_new_id,
        v_reference,
        p_site_id,
        p_settlement_date,
        p_total_amount,
        p_laborer_count,
        p_payment_channel,
        p_payment_mode,
        p_payer_source,
        p_payer_name,
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
        p_idempotency_key
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

COMMENT ON FUNCTION create_settlement_group IS
  'Atomically creates a settlement_group with guaranteed unique sequential reference '
  '(SET-YYMMDD-NNN format). Uses advisory lock (site+date) to prevent race conditions. '
  'Accepts optional p_idempotency_key: if provided and a row with that key already '
  'exists, returns it immediately (safe client-side retry). Version 3.0.';

GRANT EXECUTE ON FUNCTION create_settlement_group TO authenticated;
GRANT EXECUTE ON FUNCTION create_settlement_group TO service_role;
