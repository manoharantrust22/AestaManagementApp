-- Engineer-wallet FIFO allocator: STOP skipping material payments.
--
-- WHY: allocate_spend_fifo (20260616100000) deliberately skipped any spend
-- linked to a material_purchase_expenses row, on the theory that "material
-- payments are NOT funded from the engineer's deposit float". In practice the
-- material settlements that reach the wallet are recorded with
-- payment_channel='engineer_wallet' — i.e. they ARE paid out of the engineer's
-- deposited cash. Skipping them meant those rupees hit the wallet BALANCE
-- (v_engineer_wallet_balance sums every txn) but were invisible in the SOURCE
-- pools card (v_engineer_wallet_pools reads only engineer_wallet_spend_allocations).
-- Result: a wallet that is actually empty (or overdrawn) showed most of its
-- deposited, already-sourced money as still "available". Concretely, Ajith @
-- Srinivasan: ₹1,16,650 deposited (Client ₹1,09,150 + Own ₹7,500), ₹1,17,200
-- spent (incl. ₹85,100 of material settlements), balance −₹550 — yet the card
-- showed ₹84,550 "available".
--
-- FIX: drop the materials short-circuit so material wallet-spends drain the
-- deposit sources oldest-first exactly like salary/misc spends; any uncovered
-- remainder becomes the existing kind='pending' row. This realigns the SQL with
-- the authoritative JS model (src/lib/wallet/walletAllocation.ts deriveAllocations,
-- which is material-agnostic). A material expense's own settlement_payer_source
-- is untouched and remains available for material-side reporting.
--
-- Then BACKFILL: re-derive the (engineer,site) wallets that have a material
-- wallet-spend via the existing idempotent rebuild_wallet_allocations
-- (20260616100002). System-wide that is a handful of spends across 2 pairs.

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

  -- NOTE: material payments are NO LONGER skipped. When a material settlement is
  -- paid through the wallet it draws from the deposited cash like any other
  -- spend, so it must consume the source pool (and become pending if the pool is
  -- already drained). See the migration header for the full rationale.

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

GRANT EXECUTE ON FUNCTION allocate_spend_fifo TO authenticated, service_role;

-- Backfill: rebuild every wallet that has a material wallet-spend so existing
-- material payments are re-allocated against the deposit sources, chronologically.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT t.user_id, t.site_id
    FROM site_engineer_transactions t
    WHERE t.transaction_type = 'spend'
      AND t.cancelled_at IS NULL
      AND EXISTS (
        SELECT 1 FROM material_purchase_expenses x
        WHERE x.engineer_transaction_id = t.id
      )
  LOOP
    PERFORM rebuild_wallet_allocations(r.user_id, r.site_id);
  END LOOP;
END $$;
