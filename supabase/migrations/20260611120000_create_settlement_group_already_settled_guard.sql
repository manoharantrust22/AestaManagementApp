-- Duplicate-settlement prevention — server-side "already settled" guard.
--
-- Root cause of the duplicate salary-settlement spends (two live settlement_groups
-- + two wallet debits for one real payment): the client minted a FRESH random
-- idempotency key per top-level processSettlement() call, so a second invocation
-- (ISP proxy stall + retry, reload, two tabs, the dialog's 30s timeout-then-retry)
-- generated a new key, missed the idempotency lookup, and created a second group
-- with the next SET-…-NNN reference. There was no server-side guard stopping the
-- SAME attendance rows from being settled twice.
--
-- This migration recreates create_settlement_group with TWO defences (the client
-- also switches to a DETERMINISTIC idempotency key — see deterministicKey.ts — so
-- a re-submit of the same records collides on settlement_groups_idempotency_key_key
-- and returns the existing row):
--   1. The idempotency lookup now ignores cancelled rows (AND is_cancelled = false),
--      so a re-settle after a reverse (which NULLs the key — see reverse_settlement)
--      can never resurrect a dead group.
--   2. NEW: after the per-date advisory lock, before insert, RAISE if any of the
--      passed attendance rows already carry a LIVE (is_cancelled = false)
--      settlement_group_id. This runs only on an idempotency-key MISS, so genuine
--      retries (which return early at the idempotency lookup) never trip it. Placed
--      inside the lock to close the TOCTOU window that let two different keys settle
--      overlapping records.
--
-- Two new params (p_attendance_daily_ids / p_attendance_market_ids) are appended
-- with DEFAULT NULL so existing callers that don't pass them keep working (guard is
-- simply skipped when no ids are supplied — the deterministic key still prevents
-- doubles for those paths).
--
-- Reproduced verbatim from 20260524150000_settlement_global_sequence_restore.sql
-- (the live 21-arg version: per-date lock, global per-date sequence, idempotency,
-- payer_source_split) with only the three additions above.

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
  p_payer_source_split jsonb DEFAULT NULL,
  p_attendance_daily_ids uuid[] DEFAULT NULL,
  p_attendance_market_ids uuid[] DEFAULT NULL
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
  -- Idempotency: same key returns the original LIVE row (safe client-side retry).
  -- Cancelled rows are ignored so a legitimate re-settle after a reverse (which
  -- NULLs the key) is never short-circuited onto a dead group.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT sg.id, sg.settlement_reference
    INTO id, settlement_reference
    FROM settlement_groups sg
    WHERE sg.idempotency_key = p_idempotency_key
      AND sg.is_cancelled = false;

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

  -- =========================================================================
  -- ALREADY-SETTLED GUARD (runs only on an idempotency-key miss, under the lock)
  -- =========================================================================
  -- Refuse to settle attendance rows that are already linked to a LIVE
  -- settlement. This is the structural backstop against double payment: even if
  -- a caller forgets the deterministic key, the same records can never be
  -- settled twice while the first settlement is live.
  IF p_attendance_daily_ids IS NOT NULL AND array_length(p_attendance_daily_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM daily_attendance da
      JOIN settlement_groups sg2 ON sg2.id = da.settlement_group_id
      WHERE da.id = ANY (p_attendance_daily_ids)
        AND da.settlement_group_id IS NOT NULL
        AND sg2.is_cancelled = false
    ) THEN
      RAISE EXCEPTION 'One or more daily attendance records are already settled under a live settlement (possible duplicate submission). Reverse the existing settlement first.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF p_attendance_market_ids IS NOT NULL AND array_length(p_attendance_market_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM market_laborer_attendance ma
      JOIN settlement_groups sg3 ON sg3.id = ma.settlement_group_id
      WHERE ma.id = ANY (p_attendance_market_ids)
        AND ma.settlement_group_id IS NOT NULL
        AND sg3.is_cancelled = false
    ) THEN
      RAISE EXCEPTION 'One or more market attendance records are already settled under a live settlement (possible duplicate submission). Reverse the existing settlement first.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

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
  'Atomically creates a settlement_group with globally-unique sequential reference (SET-YYMMDD-NNN). Per-date advisory lock + per-date MAX scan. Idempotency (p_idempotency_key, now LIVE-rows-only) + payer-source split (p_payer_source_split). v4.0 adds the already-settled guard: when p_attendance_daily_ids / p_attendance_market_ids are supplied, RAISEs if any are already linked to a live settlement (structural double-payment prevention). Built on 20260524150000.';
