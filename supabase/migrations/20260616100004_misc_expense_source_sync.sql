-- Keep misc_expenses.payer_source / payer_name / payer_source_split in sync with
-- the wallet's FIFO allocations, so every reader (misc list, view dialog, wallet
-- spend detail, v_all_expenses) shows the TRUE funding source(s) — never the old
-- hardcoded 'own_money' default, and updated automatically when a later deposit
-- heals a pending gap.
--
-- A wallet-funded misc expense links to its spend via engineer_transaction_id;
-- the spend's allocations are the source of truth. This denormalises that truth
-- onto the misc row (so plain column reads are correct) and a trigger re-syncs it
-- whenever the spend's allocations change (spend, heal, edit, cancel, rebuild).

-- 0) Widen the payer_source constraints so wallet-derived attribution fits:
--    add 'split' (multi-source) + 'pending' (engineer-fronted), and allow a
--    derived breakdown of up to 6 entries (a spend can touch several deposit
--    sources + a pending remainder), not just the manual UI's 2–3.
ALTER TABLE misc_expenses
  DROP CONSTRAINT IF EXISTS misc_expenses_payer_source_check;
ALTER TABLE misc_expenses
  ADD CONSTRAINT misc_expenses_payer_source_check
  CHECK (payer_source = ANY (ARRAY[
    'own_money','amma_money','client_money','trust_account',
    'other_site_money','custom','mothers_money','split','pending'
  ]));

ALTER TABLE misc_expenses
  DROP CONSTRAINT IF EXISTS misc_expenses_payer_source_split_len_chk;
ALTER TABLE misc_expenses
  ADD CONSTRAINT misc_expenses_payer_source_split_len_chk
  CHECK (
    payer_source_split IS NULL
    OR (jsonb_typeof(payer_source_split) = 'array'
        AND jsonb_array_length(payer_source_split) >= 2
        AND jsonb_array_length(payer_source_split) <= 6)
  );

CREATE OR REPLACE FUNCTION sync_misc_expense_source(p_misc_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_spend  uuid;
  v_groups int;
  v_source text;
  v_name   text;
  v_split  jsonb;
BEGIN
  SELECT engineer_transaction_id INTO v_spend FROM misc_expenses WHERE id = p_misc_id;
  -- Not wallet-funded (company_direct / out-of-pocket): leave the manual picker
  -- value untouched.
  IF v_spend IS NULL THEN
    RETURN;
  END IF;

  WITH agg AS (
    SELECT a.payer_source AS source,
           MAX(a.payer_name) AS name,
           SUM(a.amount)     AS amount
    FROM engineer_wallet_spend_allocations a
    WHERE a.spend_id = v_spend
    GROUP BY a.payer_source
  )
  SELECT
    (SELECT count(*) FROM agg),
    (SELECT source FROM agg ORDER BY (source = 'pending'), source LIMIT 1),
    (SELECT name   FROM agg ORDER BY (source = 'pending'), source LIMIT 1),
    (SELECT jsonb_agg(
              jsonb_build_object('source', source, 'amount', amount, 'name', name)
              ORDER BY (source = 'pending'), source)
       FROM agg)
  INTO v_groups, v_source, v_name, v_split;

  IF v_groups IS NULL OR v_groups = 0 THEN
    RETURN;  -- no allocations yet; leave as-is
  ELSIF v_groups = 1 THEN
    UPDATE misc_expenses
    SET payer_source = v_source, payer_name = v_name, payer_source_split = NULL
    WHERE id = p_misc_id;
  ELSE
    UPDATE misc_expenses
    SET payer_source = 'split', payer_name = NULL, payer_source_split = v_split
    WHERE id = p_misc_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION sync_misc_expense_source TO authenticated, service_role;

-- Re-sync the linked misc expense whenever a spend's allocations change.
CREATE OR REPLACE FUNCTION sync_misc_from_allocation_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_spend uuid := COALESCE(NEW.spend_id, OLD.spend_id);
  v_misc  uuid;
BEGIN
  SELECT id INTO v_misc FROM misc_expenses WHERE engineer_transaction_id = v_spend;
  IF v_misc IS NOT NULL THEN
    PERFORM sync_misc_expense_source(v_misc);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_misc_from_allocation ON engineer_wallet_spend_allocations;
CREATE TRIGGER trg_sync_misc_from_allocation
AFTER INSERT OR UPDATE OR DELETE ON engineer_wallet_spend_allocations
FOR EACH ROW
EXECUTE FUNCTION sync_misc_from_allocation_change();

COMMENT ON FUNCTION sync_misc_expense_source IS
  'Recomputes a wallet-funded misc expense''s payer_source/payer_name/payer_source_split from its spend''s current allocations (single source, ''split'' + breakdown, or a pending gap). Called by createMiscExpense after the spend, and by the allocation-change trigger.';

-- One-time: correct every existing wallet-funded misc expense from the freshly
-- re-derived allocations (fixes the rows historically stamped 'own_money').
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM misc_expenses WHERE engineer_transaction_id IS NOT NULL LOOP
    PERFORM sync_misc_expense_source(r.id);
  END LOOP;
END $$;
