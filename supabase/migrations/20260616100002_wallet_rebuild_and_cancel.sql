-- Re-derivation + self-healing on edit/cancel.
--
-- rebuild_wallet_allocations(engineer, site) wipes that wallet's allocations and
-- replays its non-cancelled deposits & spends in chronological order under the
-- same allocator+heal rules used live. It is idempotent (delete + replay) and is
-- the single source of truth reused by both the global backfill and the
-- edit/cancel trigger.
--
-- This REPLACES the old block_deposit_cancel_with_allocations guard. Instead of
-- forbidding a deposit cancellation that has allocations, we now simply
-- re-derive: cancelling a deposit un-funds whatever it paid for (those portions
-- become pending again or are covered by other deposits) — correct by
-- construction, no manual "reverse the spends first" dance.

CREATE OR REPLACE FUNCTION rebuild_wallet_allocations(
  p_engineer_id uuid,
  p_site_id     uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ev record;
BEGIN
  IF p_engineer_id IS NULL OR p_site_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_engineer_id::text || ':' || p_site_id::text));

  DELETE FROM engineer_wallet_spend_allocations a
  USING site_engineer_transactions s
  WHERE a.spend_id = s.id
    AND s.user_id = p_engineer_id
    AND s.site_id = p_site_id;

  FOR v_ev IN
    SELECT id, transaction_type
    FROM site_engineer_transactions
    WHERE user_id = p_engineer_id
      AND site_id = p_site_id
      AND cancelled_at IS NULL
      AND transaction_type IN ('deposit','spend')
    ORDER BY transaction_date ASC, created_at ASC, id ASC
  LOOP
    IF v_ev.transaction_type = 'spend' THEN
      PERFORM allocate_spend_fifo(v_ev.id);
    ELSE
      PERFORM heal_pending_allocations(p_engineer_id, p_site_id, v_ev.id);
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION rebuild_wallet_allocations TO authenticated, service_role;

COMMENT ON FUNCTION rebuild_wallet_allocations IS
  'Idempotently re-derives all FIFO source allocations for one (engineer,site) by replaying non-cancelled deposits & spends chronologically. Reused by the global backfill and the edit/cancel trigger.';

-- ---------------------------------------------------------------------------
-- Self-healing trigger: any edit that changes an allocation-affecting field of
-- a deposit/spend (amount, source, split, date, cancellation) re-derives the
-- whole wallet so allocations stay consistent.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rebuild_wallet_allocations_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.transaction_type IN ('deposit','spend')
     AND (
          OLD.cancelled_at        IS DISTINCT FROM NEW.cancelled_at
       OR OLD.amount              IS DISTINCT FROM NEW.amount
       OR OLD.payer_source        IS DISTINCT FROM NEW.payer_source
       OR OLD.payer_source_split  IS DISTINCT FROM NEW.payer_source_split
       OR OLD.transaction_date    IS DISTINCT FROM NEW.transaction_date
     )
  THEN
    PERFORM rebuild_wallet_allocations(NEW.user_id, NEW.site_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Retire the old hard-block guard.
DROP TRIGGER IF EXISTS trg_block_deposit_cancel_with_allocations ON site_engineer_transactions;
DROP FUNCTION IF EXISTS block_deposit_cancel_with_allocations();

DROP TRIGGER IF EXISTS trg_rebuild_wallet_allocations_on_change ON site_engineer_transactions;
CREATE TRIGGER trg_rebuild_wallet_allocations_on_change
AFTER UPDATE ON site_engineer_transactions
FOR EACH ROW
EXECUTE FUNCTION rebuild_wallet_allocations_on_change();

COMMENT ON FUNCTION rebuild_wallet_allocations_on_change IS
  'Re-derives a wallet''s source allocations whenever a deposit/spend is cancelled, restored, or has its amount/source/split/date edited. Replaces the old block_deposit_cancel guard with a self-healing re-derivation.';
