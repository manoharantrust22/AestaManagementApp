-- Backfill spend->settlement link + enforce one live debit per settlement.
--
-- Depends on 20260611120100 (atomic_record_wallet_spend now stamps
-- settlement_group_id on NEW spends). This backfills EXISTING live salary/contract
-- spends from the reverse FK (settlement_groups.engineer_transaction_id), then adds
-- a partial unique index so a settlement can never again carry two live wallet
-- debits (belt-and-suspenders behind the deterministic idempotency key).

-- 1. Backfill: each spend gets the id of the group that points back at it.
UPDATE site_engineer_transactions s
SET settlement_group_id = sg.id
FROM settlement_groups sg
WHERE sg.engineer_transaction_id = s.id
  AND s.transaction_type = 'spend'
  AND s.settlement_group_id IS NULL;

-- 2. Safety pre-check: the unique index below would fail if two LIVE spends already
-- share one settlement_group_id. That is not the known duplicate signature (each
-- duplicate group owns its own spend), but fail with a clear message if it occurs.
DO $$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(settlement_group_id::text, ', ')
  INTO v_bad
  FROM (
    SELECT settlement_group_id
    FROM site_engineer_transactions
    WHERE settlement_group_id IS NOT NULL
      AND cancelled_at IS NULL
      AND transaction_type = 'spend'
    GROUP BY settlement_group_id
    HAVING COUNT(*) > 1
  ) d;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot create uq_set_txn_live_settlement: these settlement_group_ids already have >1 live wallet spend (reverse the duplicates first): %', v_bad
      USING ERRCODE = 'P0001';
  END IF;
END $$;

-- 3. One live wallet debit per settlement. Cancelled spends (cancelled_at set) and
-- non-settlement spends (NULL settlement_group_id) are excluded, so re-settle after
-- a reverse works and ad-hoc/deposit rows are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS uq_set_txn_live_settlement
  ON site_engineer_transactions (settlement_group_id)
  WHERE settlement_group_id IS NOT NULL
    AND cancelled_at IS NULL
    AND transaction_type = 'spend';

COMMENT ON INDEX uq_set_txn_live_settlement IS
  'At most one live (non-cancelled) wallet spend per settlement_group. Backstop behind the deterministic settlement idempotency key against double-debiting one settlement.';
