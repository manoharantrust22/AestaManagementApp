-- Deposit-time healing of pending (engineer-fronted) wallet spends.
--
-- When a spend ran ahead of deposits, the uncovered portion is a kind='pending'
-- allocation row (the engineer fronted that cash). A later deposit should
-- back-fill the OLDEST pending gaps first with its own source — turning
-- "Pending ₹130" into "Trust Account ₹130" — and keep any remainder available
-- for future spends. Money is never made to wait for a matching source label.
--
-- Mirrors src/lib/wallet/walletAllocation.ts (the deposit branch of
-- deriveAllocations) — its unit tests pin the exact behaviour.

CREATE OR REPLACE FUNCTION heal_pending_allocations(
  p_engineer_id uuid,
  p_site_id     uuid,
  p_deposit_id  uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_unit record;
  v_rem  numeric;
  v_p    record;
  v_take numeric;
BEGIN
  -- For each source unit this deposit contributes (one unit for a normal
  -- deposit; several for a split deposit), heal the oldest pending gaps first.
  FOR v_unit IN
    SELECT u.source, u.name, u.seq,
           u.amount - COALESCE((
             SELECT SUM(a.amount) FROM engineer_wallet_spend_allocations a
             WHERE a.deposit_id = p_deposit_id
               AND a.payer_source = u.source
               AND a.kind = 'source'
           ), 0) AS remaining
    FROM _wallet_deposit_units(p_engineer_id, p_site_id) u
    WHERE u.deposit_id = p_deposit_id
    ORDER BY u.seq ASC
  LOOP
    v_rem := v_unit.remaining;
    CONTINUE WHEN v_rem <= 0;

    FOR v_p IN
      SELECT a.id, a.spend_id, a.amount
      FROM engineer_wallet_spend_allocations a
      JOIN site_engineer_transactions s ON s.id = a.spend_id
      WHERE a.kind = 'pending'
        AND s.user_id = p_engineer_id
        AND s.site_id = p_site_id
        AND s.cancelled_at IS NULL
      ORDER BY s.transaction_date ASC, s.created_at ASC, a.id ASC
    LOOP
      EXIT WHEN v_rem <= 0;
      v_take := LEAST(v_rem, v_p.amount);
      INSERT INTO engineer_wallet_spend_allocations
        (spend_id, deposit_id, kind, payer_source, payer_name, amount)
      VALUES (v_p.spend_id, p_deposit_id, 'source', v_unit.source, v_unit.name, ROUND(v_take, 2));

      IF v_take >= v_p.amount THEN
        DELETE FROM engineer_wallet_spend_allocations WHERE id = v_p.id;
      ELSE
        UPDATE engineer_wallet_spend_allocations
        SET amount = amount - v_take
        WHERE id = v_p.id;
      END IF;
      v_rem := v_rem - v_take;
    END LOOP;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION heal_pending_allocations TO authenticated, service_role;

COMMENT ON FUNCTION heal_pending_allocations IS
  'Applies a deposit''s funds to the oldest outstanding kind=pending allocations first, converting them into kind=source rows backed by this deposit. Remainder stays available for future spends. Called by atomic_record_wallet_deposit and rebuild_wallet_allocations.';

-- ---------------------------------------------------------------------------
-- atomic_record_wallet_deposit: insert a deposit + heal pending gaps, under the
-- same per-(engineer,site) advisory lock as the spend allocator. recordDeposit
-- (engineerWalletV2.ts) calls this instead of a bare INSERT.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION atomic_record_wallet_deposit(
  p_engineer_id         uuid,
  p_site_id             uuid,
  p_amount              numeric,
  p_transaction_date    date,
  p_payment_mode        text,
  p_proof_url           text,
  p_notes               text,
  p_recorded_by         text,
  p_recorded_by_user_id uuid,
  p_payer_source        text,
  p_payer_name          text  DEFAULT NULL,
  p_payer_source_split  jsonb DEFAULT NULL,
  p_description         text  DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Wallet deposit amount must be positive (got %)', p_amount USING ERRCODE = '22023';
  END IF;
  IF p_engineer_id IS NULL THEN
    RAISE EXCEPTION 'Wallet deposit requires an engineer_id' USING ERRCODE = '22023';
  END IF;
  IF p_site_id IS NULL THEN
    RAISE EXCEPTION 'Wallet deposit requires a site_id' USING ERRCODE = '22023';
  END IF;
  IF p_payment_mode NOT IN ('cash','upi','bank_transfer') THEN
    RAISE EXCEPTION 'Invalid payment_mode % for wallet deposit', p_payment_mode USING ERRCODE = '22023';
  END IF;
  IF p_payer_source IS NULL THEN
    RAISE EXCEPTION 'Wallet deposit requires a payer_source' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_engineer_id::text || ':' || p_site_id::text));

  INSERT INTO site_engineer_transactions (
    user_id, transaction_type, amount, transaction_date, site_id,
    description, payment_mode, proof_url,
    payer_source, payer_name, payer_source_split,
    notes, recorded_by, recorded_by_user_id
  ) VALUES (
    p_engineer_id, 'deposit', p_amount, COALESCE(p_transaction_date, CURRENT_DATE), p_site_id,
    p_description, p_payment_mode, p_proof_url,
    p_payer_source, p_payer_name, p_payer_source_split,
    p_notes, COALESCE(p_recorded_by, 'system'), p_recorded_by_user_id
  )
  RETURNING id INTO v_id;

  PERFORM heal_pending_allocations(p_engineer_id, p_site_id, v_id);

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION atomic_record_wallet_deposit TO authenticated, service_role;

COMMENT ON FUNCTION atomic_record_wallet_deposit IS
  'Records a wallet deposit and immediately heals the oldest pending (engineer-fronted) spends with it, under the per-(engineer,site) advisory lock.';
