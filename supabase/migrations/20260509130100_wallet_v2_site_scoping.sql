-- Engineer Wallet v2 — Site-scoped balances
--
-- Wallet v2 Phase 1 tracked one running balance per engineer. The user gives money
-- earmarked for specific sites ("here's ₹50k for Padmavathy, ₹30k for Srinivasan");
-- that money should only be spendable on the matching site. This migration scopes
-- every wallet entry by site_id and enforces it at the database.
--
-- Each engineer effectively holds N pools (one per site). Deposits and returns are
-- tagged with a site; spends are blocked when the source site's pool is insufficient.
--
-- Production has zero rows in site_engineer_transactions at apply time, so the
-- NOT NULL flip is safe with no backfill.

-- 1. site_id becomes mandatory on every ledger row.
ALTER TABLE site_engineer_transactions
  ALTER COLUMN site_id SET NOT NULL;

-- Add FK to sites if not already present (defensive — schema audit shows the column
-- has no FK constraint on prod).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'site_engineer_transactions'
      AND c.conname = 'site_engineer_transactions_site_id_fkey'
  ) THEN
    ALTER TABLE site_engineer_transactions
      ADD CONSTRAINT site_engineer_transactions_site_id_fkey
        FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- 2. Index supporting the new (user_id, site_id, transaction_date) read pattern.
DROP INDEX IF EXISTS idx_site_engineer_transactions_user_date;
CREATE INDEX IF NOT EXISTS idx_site_engineer_transactions_user_site_date
  ON site_engineer_transactions (user_id, site_id, transaction_date DESC, id DESC)
  WHERE cancelled_at IS NULL;

-- 3. Recreate balance view grouped by (user_id, site_id).
DROP VIEW IF EXISTS v_engineer_wallet_balance;
CREATE VIEW v_engineer_wallet_balance AS
SELECT
  user_id,
  site_id,
  COALESCE(SUM(CASE transaction_type
                 WHEN 'deposit' THEN amount
                 WHEN 'spend'   THEN -amount
                 WHEN 'return'  THEN -amount
               END), 0) AS balance,
  MAX(transaction_date) AS last_txn_at,
  COUNT(*) FILTER (WHERE transaction_type = 'deposit') AS deposit_count,
  COUNT(*) FILTER (WHERE transaction_type = 'spend')   AS spend_count,
  COUNT(*) FILTER (WHERE transaction_type = 'return')  AS return_count,
  SUM(amount) FILTER (WHERE transaction_type = 'deposit') AS total_deposited,
  SUM(amount) FILTER (WHERE transaction_type = 'spend')   AS total_spent,
  SUM(amount) FILTER (WHERE transaction_type = 'return')  AS total_returned
FROM site_engineer_transactions
WHERE cancelled_at IS NULL
GROUP BY user_id, site_id;

GRANT SELECT ON v_engineer_wallet_balance TO authenticated, anon;

COMMENT ON VIEW v_engineer_wallet_balance IS
  'Per-(engineer, site) wallet balance + lifetime totals, derived live from site_engineer_transactions.';

-- 4. Replace the spend RPC. site_id moves from optional to required and becomes
--    part of the lock and the balance check.
DROP FUNCTION IF EXISTS atomic_record_wallet_spend(uuid, numeric, date, text, text, text, text, uuid, uuid, text);

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
  p_description        text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_balance numeric;
  v_tx_id   uuid;
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

  -- Per-(engineer, site) advisory lock — two sites' pools serialise independently.
  PERFORM pg_advisory_xact_lock(hashtext(p_engineer_id::text || ':' || p_site_id::text));

  SELECT balance INTO v_balance
    FROM v_engineer_wallet_balance
   WHERE user_id = p_engineer_id AND site_id = p_site_id;

  IF v_balance IS NULL OR v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient wallet balance for site %: have %, need %',
      p_site_id, COALESCE(v_balance, 0), p_amount
      USING ERRCODE = 'WLT01';
  END IF;

  INSERT INTO site_engineer_transactions (
    user_id, transaction_type, amount, transaction_date, site_id,
    description, payment_mode, proof_url, notes,
    recorded_by, recorded_by_user_id
  ) VALUES (
    p_engineer_id, 'spend', p_amount, COALESCE(p_transaction_date, CURRENT_DATE), p_site_id,
    p_description, p_payment_mode, p_proof_url, p_notes,
    COALESCE(p_recorded_by, 'system'), p_recorded_by_user_id
  )
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION atomic_record_wallet_spend(
  uuid, uuid, numeric, date, text, text, text, text, uuid, text
) TO authenticated;

COMMENT ON FUNCTION atomic_record_wallet_spend IS
  'Sole write path for wallet spend rows. Site-scoped: holds a per-(engineer,site) advisory lock and verifies the site pool before insert.';
