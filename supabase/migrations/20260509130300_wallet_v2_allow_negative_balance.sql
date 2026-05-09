-- Engineer Wallet v2 — allow negative balance ("office owes engineer").
--
-- Real workflow: engineer sometimes pays out-of-pocket when the wallet pool is
-- empty (urgent site expense, no office reach). The deficit is what the office
-- owes him. Hard-block enforcement was wrong for this case.
--
-- New behaviour: atomic_record_wallet_spend accepts ANY positive amount, even
-- if it drives the (engineer, site) pool negative. The negative balance IS the
-- IOU. A subsequent positive deposit on the same site clears the deficit.
--
-- The advisory lock stays — concurrency is still real (two settlements at the
-- same time on the same site shouldn't race the read/write). Only the
-- balance-sufficiency check is dropped.

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

  -- Per-(engineer, site) advisory lock so concurrent spends on the same pool
  -- serialise. Note: we no longer reject on insufficient balance — a negative
  -- result is meaningful ("engineer paid out-of-pocket; office owes him").
  PERFORM pg_advisory_xact_lock(hashtext(p_engineer_id::text || ':' || p_site_id::text));

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
  'Sole write path for wallet spend rows. Site-scoped advisory lock for concurrency. Allows negative pool balance — a deficit is "office owes engineer" and is cleared by a subsequent deposit on the same site.';
