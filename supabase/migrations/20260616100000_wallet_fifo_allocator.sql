-- Engineer-wallet source allocation: PROPORTIONAL -> FIFO WATERFALL.
--
-- Why: the proportional allocator split every multi-pool spend pro-rata, which
-- produced confusing fractional attributions (e.g. Amma ₹4,575.57 + Trust
-- ₹824.43 on a ₹5,400 spend). A FIFO waterfall — drain the oldest deposit
-- source fully before spilling to the next — keeps most spends on a single
-- clean source and makes genuine spills clean (Amma ₹150 + Trust ₹30). This
-- mirrors the app's material-usage waterfall (record_batch_usage_waterfall).
--
-- Also: the uncovered remainder of a spend was a 'overdraft' allocation row.
-- It is renamed to 'pending' (engineer fronted it; awaiting a deposit) — a
-- later deposit HEALS it (see 20260616100001). No "overdraft" jargon anywhere.
--
-- This is the authoritative behaviour spec: src/lib/wallet/walletAllocation.ts
-- (deriveAllocations) + its unit tests pin the exact numbers this SQL mirrors.

-- 1) Drop the old kind CHECK FIRST (it only allows 'source'/'overdraft', so it
--    would reject the relabel below).
ALTER TABLE engineer_wallet_spend_allocations
  DROP CONSTRAINT IF EXISTS engineer_wallet_spend_allocations_kind_check;

-- 2) Relabel legacy 'overdraft' rows to 'pending'.
UPDATE engineer_wallet_spend_allocations
SET kind = 'pending', payer_source = 'pending', deposit_id = NULL
WHERE kind = 'overdraft';

-- 3) Add the new kind CHECK: 'source' | 'pending'.
ALTER TABLE engineer_wallet_spend_allocations
  ADD CONSTRAINT engineer_wallet_spend_allocations_kind_check
  CHECK (kind IN ('source','pending'));

COMMENT ON TABLE engineer_wallet_spend_allocations IS
  'Splits each wallet spend across the deposit sources that funded it, FIFO (oldest deposit first). kind=source rows reference the funding deposit; a single kind=pending row (deposit_id NULL, payer_source=''pending'') holds any portion the engineer fronted before funds were deposited — healed later by atomic_record_wallet_deposit.';

-- ---------------------------------------------------------------------------
-- Deposit "source units": expand each non-cancelled deposit into one row per
-- funding source. A normal deposit -> one unit; a split deposit (payer_source
-- ='split') -> one unit per payer_source_split entry. Lets the allocator treat
-- a split deposit as several independent single-source pools. (No split
-- deposits exist today, but the Add-Funds UI allows them.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _wallet_deposit_units(p_engineer_id uuid, p_site_id uuid)
RETURNS TABLE (
  deposit_id uuid,
  source     text,
  name       text,
  amount     numeric,
  txn_date   date,
  created_at timestamptz,
  seq        int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT d.id, d.payer_source, d.payer_name, d.amount, d.transaction_date, d.created_at, 0
  FROM site_engineer_transactions d
  WHERE d.user_id = p_engineer_id
    AND d.site_id = p_site_id
    AND d.transaction_type = 'deposit'
    AND d.cancelled_at IS NULL
    AND d.payer_source IS NOT NULL
    AND d.payer_source <> 'split'
  UNION ALL
  SELECT d.id, c.source, c.name, c.amount, d.transaction_date, d.created_at, c.seq::int
  FROM site_engineer_transactions d
  CROSS JOIN LATERAL ROWS FROM (
    jsonb_to_recordset(d.payer_source_split) AS (source text, name text, amount numeric)
  ) WITH ORDINALITY AS c(source, name, amount, seq)
  WHERE d.user_id = p_engineer_id
    AND d.site_id = p_site_id
    AND d.transaction_type = 'deposit'
    AND d.cancelled_at IS NULL
    AND d.payer_source = 'split'
    AND d.payer_source_split IS NOT NULL;
$$;

-- ---------------------------------------------------------------------------
-- allocate_spend_fifo: allocate one EXISTING spend across deposit source units
-- that pre-date it (chronologically), oldest first, draining each unit fully
-- before spilling. Remainder -> one pending row. Idempotent only when called on
-- a spend with no existing allocations (rebuild deletes first).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION allocate_spend_fifo(p_spend_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_spend record;
  v_unit  record;
  v_need  numeric;
  v_take  numeric;
BEGIN
  SELECT id, user_id, site_id, amount, transaction_date, created_at
    INTO v_spend
  FROM site_engineer_transactions
  WHERE id = p_spend_id AND transaction_type = 'spend';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'allocate_spend_fifo: spend % not found', p_spend_id USING ERRCODE = '22023';
  END IF;

  -- Material payments are settled through the material/PO flow and carry their
  -- own declared source (material_purchase_expenses.settlement_payer_source).
  -- They are NOT funded from the engineer's deposit float, so they must not
  -- consume the source pool (this mirrors how the deposits — tagged "for
  -- salary / kambi / karuppiya expenses" — are the engineer's cash float for
  -- day-to-day spends). Skip allocation entirely for them; they get no wallet
  -- allocation rows and never become pending.
  IF EXISTS (
    SELECT 1 FROM material_purchase_expenses mpe
    WHERE mpe.engineer_transaction_id = p_spend_id
  ) THEN
    RETURN;
  END IF;

  v_need := v_spend.amount;

  FOR v_unit IN
    SELECT u.deposit_id, u.source, u.name,
           u.amount - COALESCE((
             SELECT SUM(a.amount) FROM engineer_wallet_spend_allocations a
             WHERE a.deposit_id = u.deposit_id
               AND a.payer_source = u.source
               AND a.kind = 'source'
           ), 0) AS remaining
    FROM _wallet_deposit_units(v_spend.user_id, v_spend.site_id) u
    WHERE u.txn_date < v_spend.transaction_date
       OR (u.txn_date = v_spend.transaction_date AND u.created_at <= v_spend.created_at)
    ORDER BY u.txn_date ASC, u.created_at ASC, u.seq ASC
  LOOP
    EXIT WHEN v_need <= 0;
    IF v_unit.remaining <= 0 THEN CONTINUE; END IF;
    v_take := LEAST(v_unit.remaining, v_need);
    INSERT INTO engineer_wallet_spend_allocations
      (spend_id, deposit_id, kind, payer_source, payer_name, amount)
    VALUES (p_spend_id, v_unit.deposit_id, 'source', v_unit.source, v_unit.name, ROUND(v_take, 2));
    v_need := v_need - v_take;
  END LOOP;

  IF v_need > 0.005 THEN
    INSERT INTO engineer_wallet_spend_allocations
      (spend_id, deposit_id, kind, payer_source, payer_name, amount)
    VALUES (p_spend_id, NULL, 'pending', 'pending', NULL, ROUND(v_need, 2));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION _wallet_deposit_units TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION allocate_spend_fifo TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Rewrite atomic_record_wallet_spend to use the FIFO allocator. Preserves the
-- per-(engineer,site) advisory lock, validation, and p_settlement_group_id.
-- ---------------------------------------------------------------------------
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
  v_tx_id uuid;
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

  -- Per-(engineer, site) advisory lock — concurrent spends/deposits on the
  -- same pool serialise here so the allocator reads consistent pool state.
  PERFORM pg_advisory_xact_lock(hashtext(p_engineer_id::text || ':' || p_site_id::text));

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

  PERFORM allocate_spend_fifo(v_tx_id);

  RETURN v_tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION atomic_record_wallet_spend TO authenticated, service_role;

COMMENT ON FUNCTION atomic_record_wallet_spend IS
  'Records a wallet spend + FIFO-waterfall source allocations under a per-(engineer,site) advisory lock. Spend drains oldest deposit sources first; uncovered remainder becomes a kind=pending row, healed later by atomic_record_wallet_deposit. Mirrors src/lib/wallet/walletAllocation.ts.';
