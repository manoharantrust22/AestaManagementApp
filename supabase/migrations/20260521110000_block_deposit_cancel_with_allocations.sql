-- Phase 4 safety: block cancelling a deposit if doing so would leave the
-- source pool with less total amount than has already been allocated to spends.
--
-- The proportional allocator (Phase 2) only stores a single FK reference per
-- spend × source — usually pointing at the oldest deposit of that source.
-- So a naive "is this row FK-referenced?" check would falsely allow the
-- cancellation of any non-FK-referenced deposit in the same source pool,
-- silently making the pool look inconsistent.
--
-- The correct check is at the *source aggregate* level: after cancelling this
-- deposit, does the remaining (engineer, site, source) pool still cover all
-- allocations of that source? If not, raise. The fix path is to reverse the
-- spend(s) first (cancel them, allocations CASCADE), then cancel the deposit.

CREATE OR REPLACE FUNCTION block_deposit_cancel_with_allocations()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_deposits  numeric;
  v_total_allocated numeric;
BEGIN
  IF OLD.cancelled_at IS NOT NULL OR NEW.cancelled_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.transaction_type <> 'deposit' OR NEW.payer_source IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_deposits
  FROM site_engineer_transactions
  WHERE user_id = NEW.user_id
    AND site_id = NEW.site_id
    AND transaction_type = 'deposit'
    AND payer_source = NEW.payer_source
    AND cancelled_at IS NULL
    AND id <> NEW.id;

  SELECT COALESCE(SUM(a.amount), 0) INTO v_total_allocated
  FROM engineer_wallet_spend_allocations a
  JOIN site_engineer_transactions s ON s.id = a.spend_id
  WHERE s.user_id = NEW.user_id
    AND s.site_id = NEW.site_id
    AND s.cancelled_at IS NULL
    AND a.payer_source = NEW.payer_source
    AND a.kind = 'source';

  IF v_total_deposits < v_total_allocated THEN
    RAISE EXCEPTION
      'Cannot cancel this % deposit (₹%): % already allocated to spends, only ₹% would remain after cancellation. Reverse / cancel the spend(s) first.',
      NEW.payer_source,
      NEW.amount,
      v_total_allocated,
      v_total_deposits
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_deposit_cancel_with_allocations ON site_engineer_transactions;
CREATE TRIGGER trg_block_deposit_cancel_with_allocations
BEFORE UPDATE ON site_engineer_transactions
FOR EACH ROW
EXECUTE FUNCTION block_deposit_cancel_with_allocations();

COMMENT ON FUNCTION block_deposit_cancel_with_allocations() IS
  'Phase 4 of the wallet payer-source attribution feature. Prevents silent corruption when a deposit is cancelled but its source pool has already been allocated to spends.';
