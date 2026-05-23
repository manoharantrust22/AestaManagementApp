-- Extend create_settlement_group with p_payer_source_split.
-- When NULL: existing single-source behaviour (writes p_payer_source as-is).
-- When NOT NULL: validates via validate_payer_source_split, writes
--   payer_source='split', payer_source_split=<input>, payer_name=NULL.
--
-- Preserves the v3.0 audit-logging on unique_violation from
-- 20260113130000_fix_global_settlement_sequence.sql (settlement_creation_audit
-- insert + retry-exhaustion exception with HINT).

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
  p_payer_source_split jsonb DEFAULT NULL
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
  v_effective_payer_source TEXT;
  v_effective_payer_name TEXT;
BEGIN
  -- CRITICAL: Lock must be per DATE only (not per site+date)
  -- Because settlement_reference is globally unique across all sites
  v_lock_key := ('x' || substr(md5(p_settlement_date::text), 1, 8))::bit(32)::int;

  -- Acquire advisory lock for this DATE (not site+date)
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Get current date in YYMMDD format
  v_date_code := TO_CHAR(p_settlement_date, 'YYMMDD');

  -- Resolve effective payer attribution.
  -- When a split payload is supplied, validate it and force payer_source='split'
  -- with payer_name=NULL (the split JSONB carries per-source amounts/names).
  IF p_payer_source_split IS NOT NULL THEN
    PERFORM validate_payer_source_split(p_payer_source_split, p_total_amount, p_site_id);
    v_effective_payer_source := 'split';
    v_effective_payer_name := NULL;
  ELSE
    v_effective_payer_source := p_payer_source;
    v_effective_payer_name := p_payer_name;
  END IF;

  -- Retry Loop
  WHILE v_retry_count < v_max_retries LOOP
    BEGIN
      -- Find the next sequence number for this DATE across ALL sites
      -- REMOVED: site_id filter (settlement_reference is globally unique)
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

      -- Count total records for this date (across all sites)
      SELECT COUNT(DISTINCT sg2.settlement_reference)
      INTO v_existing_count
      FROM settlement_groups sg2
      WHERE sg2.settlement_reference LIKE 'SET-' || v_date_code || '-%'
        AND sg2.settlement_reference ~ ('^SET-' || v_date_code || '-\d+$');

      IF v_calculated_max != v_existing_count AND v_existing_count > 0 THEN
        RAISE WARNING 'Settlement reference mismatch for date %: calculated max=%, actual count=%. Possible sequence gaps or duplicates.',
          p_settlement_date, v_calculated_max, v_existing_count;
      END IF;

      -- Format: SET-YYMMDD-NNN
      IF v_next_seq < 1000 THEN
        v_reference := 'SET-' || v_date_code || '-' || LPAD(v_next_seq::TEXT, 3, '0');
      ELSE
        v_reference := 'SET-' || v_date_code || '-' || v_next_seq::TEXT;
      END IF;

      v_new_id := gen_random_uuid();

      -- Insert the settlement group
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
        p_payer_source_split
      );

      -- Success
      id := v_new_id;
      settlement_reference := v_reference;
      RETURN NEXT;
      RETURN;

    EXCEPTION
      WHEN unique_violation THEN
        v_retry_count := v_retry_count + 1;

        -- Audit Logging
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
              'date_code', v_date_code
            )
          );
        EXCEPTION
          WHEN OTHERS THEN
            RAISE WARNING 'Failed to write audit log: %', SQLERRM;
        END;

        IF v_retry_count >= v_max_retries THEN
          RAISE EXCEPTION 'Failed to create settlement reference after % retries. Attempted: %, Existing settlements for this date: %, Last calculated sequence: %. This may indicate duplicate references in the database. Please run check_settlement_reference_integrity() and contact support.',
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
  'Atomically creates a settlement_group with guaranteed unique sequential reference (SET-YYMMDD-NNN format). Global sequence per date across all sites. Accepts an optional p_payer_source_split JSONB; when provided, validates via validate_payer_source_split(p_split, p_total, p_site_id) and stores payer_source=''split'' with payer_name=NULL. Version 3.1';

GRANT EXECUTE ON FUNCTION create_settlement_group TO authenticated;
GRANT EXECUTE ON FUNCTION create_settlement_group TO service_role;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '====================================================================';
  RAISE NOTICE 'Extended create_settlement_group with p_payer_source_split';
  RAISE NOTICE '====================================================================';
  RAISE NOTICE 'New optional trailing param: p_payer_source_split jsonb DEFAULT NULL';
  RAISE NOTICE 'Single-source callers unchanged (omit the new param)';
  RAISE NOTICE 'Split path validates via validate_payer_source_split() and forces';
  RAISE NOTICE '  payer_source=split, payer_name=NULL';
  RAISE NOTICE 'Audit-logging on unique_violation preserved from v3.0';
  RAISE NOTICE '====================================================================';
END $$;
