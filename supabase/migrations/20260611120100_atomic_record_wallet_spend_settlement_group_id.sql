-- Link each wallet spend to its settlement at insert time.
--
-- Today atomic_record_wallet_spend inserts the spend row WITHOUT
-- settlement_group_id (the link is one-way: settlement_groups.engineer_transaction_id
-- -> spend). That means the wallet row can't be deduped or traced back to its
-- settlement. This adds an optional p_settlement_group_id that the salary/contract
-- callers pass, and stamps it on the inserted row. Deposits and ad-hoc spends pass
-- NULL (unchanged behaviour).
--
-- Enables: (1) the partial unique index uq_set_txn_live_settlement (one live debit
-- per settlement — see 20260611120400), and (2) the linked-settlement view in the
-- Spend details dialog without description-string parsing.
--
-- Reproduced verbatim from 20260521090000_engineer_wallet_spend_allocations.sql with
-- the single new param + INSERT column. The proportional allocator is unchanged.
--
-- DROP the existing 10-arg signature so the new 11-arg version is the only overload
-- (named-arg RPC calls would otherwise be ambiguous).
DROP FUNCTION IF EXISTS atomic_record_wallet_spend(
  uuid, uuid, numeric, date, text, text, text, text, uuid, text
);

CREATE OR REPLACE FUNCTION atomic_record_wallet_spend(
  p_engineer_id        uuid,
  p_site_id            uuid,
  p_amount             numeric,
  p_transaction_date   date,
  p_payment_mode       text,
  p_proof_url          text,
  p_notes              text,
  p_recorded_by        text,
  p_recorded_by_user_id uuid,
  p_description        text DEFAULT NULL,
  p_settlement_group_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tx_id          uuid;
  v_pool_total     numeric := 0;
  v_remaining      numeric;
  v_allocated      numeric := 0;
  v_last_alloc_id  uuid;
  v_source_row     record;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Wallet spend amount must be positive (got %)', p_amount USING ERRCODE = '22023';
  END IF;
  IF p_engineer_id IS NULL THEN
    RAISE EXCEPTION 'Wallet spend requires an engineer_id' USING ERRCODE = '22023';
  END IF;
  IF p_site_id IS NULL THEN
    RAISE EXCEPTION 'Wallet spend requires a site_id' USING ERRCODE = '22023';
  END IF;
  IF p_payment_mode NOT IN ('cash','upi','bank_transfer') THEN
    RAISE EXCEPTION 'Invalid payment_mode % for wallet spend', p_payment_mode USING ERRCODE = '22023';
  END IF;

  -- Per-(engineer, site) advisory lock — concurrent spends on the same pool
  -- serialise here. The allocator below reads pool state under this lock.
  PERFORM pg_advisory_xact_lock(hashtext(p_engineer_id::text || ':' || p_site_id::text));

  -- Insert the spend row first; allocations reference it via FK.
  INSERT INTO site_engineer_transactions (
    user_id, transaction_type, amount, transaction_date, site_id,
    description, payment_mode, proof_url, notes,
    recorded_by, recorded_by_user_id, settlement_group_id
  ) VALUES (
    p_engineer_id, 'spend', p_amount, COALESCE(p_transaction_date, CURRENT_DATE), p_site_id,
    p_description, p_payment_mode, p_proof_url, p_notes,
    COALESCE(p_recorded_by, 'system'), p_recorded_by_user_id, p_settlement_group_id
  )
  RETURNING id INTO v_tx_id;

  -- ---------- Proportional allocator ----------
  -- For each active source pool, compute the unspent balance
  -- (sum of non-cancelled deposits of that source, minus prior allocations
  -- against that source). Then distribute the new spend pro-rata.
  CREATE TEMP TABLE _pools ON COMMIT DROP AS
  SELECT
    d.payer_source,
    (
      SELECT d2.id FROM site_engineer_transactions d2
      WHERE d2.user_id = p_engineer_id
        AND d2.site_id = p_site_id
        AND d2.transaction_type = 'deposit'
        AND d2.payer_source = d.payer_source
        AND d2.cancelled_at IS NULL
      ORDER BY d2.transaction_date ASC, d2.created_at ASC
      LIMIT 1
    ) AS oldest_deposit_id,
    GREATEST(
      0,
      COALESCE(SUM(d.amount), 0)
      - COALESCE((
        SELECT SUM(a.amount) FROM engineer_wallet_spend_allocations a
        JOIN site_engineer_transactions s ON s.id = a.spend_id
        WHERE s.user_id = p_engineer_id
          AND s.site_id = p_site_id
          AND s.cancelled_at IS NULL
          AND a.payer_source = d.payer_source
      ), 0)
    ) AS available
  FROM site_engineer_transactions d
  WHERE d.user_id = p_engineer_id
    AND d.site_id = p_site_id
    AND d.transaction_type = 'deposit'
    AND d.cancelled_at IS NULL
    AND d.payer_source IS NOT NULL
  GROUP BY d.payer_source;

  SELECT COALESCE(SUM(available), 0) INTO v_pool_total FROM _pools WHERE available > 0;

  v_remaining := p_amount;

  IF v_pool_total > 0 THEN
    FOR v_source_row IN SELECT * FROM _pools WHERE available > 0 ORDER BY payer_source LOOP
      DECLARE
        v_share numeric;
      BEGIN
        v_share := ROUND((v_source_row.available / v_pool_total) * LEAST(p_amount, v_pool_total), 2);
        IF v_share > 0 THEN
          INSERT INTO engineer_wallet_spend_allocations
            (spend_id, deposit_id, kind, payer_source, amount)
          VALUES
            (v_tx_id, v_source_row.oldest_deposit_id, 'source', v_source_row.payer_source, v_share)
          RETURNING id INTO v_last_alloc_id;
          v_allocated := v_allocated + v_share;
        END IF;
      END;
    END LOOP;

    -- Distribute any rounding leftover (a few paise) to the most recent row.
    IF v_allocated < LEAST(p_amount, v_pool_total) AND v_last_alloc_id IS NOT NULL THEN
      UPDATE engineer_wallet_spend_allocations
      SET amount = amount + (LEAST(p_amount, v_pool_total) - v_allocated)
      WHERE id = v_last_alloc_id;
      v_allocated := LEAST(p_amount, v_pool_total);
    END IF;

    v_remaining := p_amount - v_allocated;
  END IF;

  -- Overdraft row for any portion that exceeded the pool total.
  IF v_remaining > 0.005 THEN
    INSERT INTO engineer_wallet_spend_allocations
      (spend_id, deposit_id, kind, payer_source, amount)
    VALUES
      (v_tx_id, NULL, 'overdraft', 'overdraft', ROUND(v_remaining, 2));
  END IF;

  RETURN v_tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION atomic_record_wallet_spend TO authenticated;
GRANT EXECUTE ON FUNCTION atomic_record_wallet_spend TO service_role;

COMMENT ON FUNCTION atomic_record_wallet_spend IS
  'Records a wallet spend + proportional source allocations under a per-(engineer,site) advisory lock. v2 adds optional p_settlement_group_id, stamped on the spend row so salary/contract debits link back to their settlement (enables dedupe index + linkage UI). Built on 20260521090000.';
