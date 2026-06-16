-- One-time re-derivation of ALL engineer-wallet allocations under the new FIFO
-- + deposit-healing rules, with money-reconciliation asserts.
--
-- Blast radius: this rewrites source attribution for EVERY wallet spend
-- (salary, contract, misc) — not just the 12 mislabeled misc expenses — because
-- the proportional history is replaced by FIFO. Totals are conserved; the
-- asserts below fail the migration (rolling it back) if any money is created,
-- lost, or over-allocated.

-- 1) Replay every wallet's deposits & spends under the new rules.
DO $$
DECLARE
  v_pair record;
BEGIN
  FOR v_pair IN
    SELECT DISTINCT user_id, site_id
    FROM site_engineer_transactions
    WHERE transaction_type IN ('deposit','spend')
      AND user_id IS NOT NULL
      AND site_id IS NOT NULL
  LOOP
    PERFORM rebuild_wallet_allocations(v_pair.user_id, v_pair.site_id);
  END LOOP;
END $$;

-- 2) Invariant A — every non-cancelled, NON-MATERIAL spend is fully allocated
--    (sum of its source + pending rows == its amount). Material payments are
--    intentionally excluded from the pool (they carry their own declared source)
--    and so have no allocation rows.
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad FROM (
    SELECT s.id
    FROM site_engineer_transactions s
    LEFT JOIN engineer_wallet_spend_allocations a ON a.spend_id = s.id
    WHERE s.transaction_type = 'spend' AND s.cancelled_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM material_purchase_expenses mpe
        WHERE mpe.engineer_transaction_id = s.id
      )
    GROUP BY s.id, s.amount
    HAVING ABS(s.amount - COALESCE(SUM(a.amount), 0)) > 0.01
  ) q;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Wallet re-derivation reconciliation FAILED: % non-material spend(s) have allocations != amount', v_bad;
  END IF;
END $$;

-- 3) Invariant B — no source pool is over-allocated
--    (sum of kind=source allocations of a source <= sum of that source's deposits).
DO $$
DECLARE v_bad int;
BEGIN
  WITH dep AS (
    SELECT t.user_id, t.site_id, t.payer_source AS source, SUM(t.amount) AS deposited
    FROM site_engineer_transactions t
    WHERE t.transaction_type = 'deposit' AND t.cancelled_at IS NULL
      AND t.payer_source IS NOT NULL AND t.payer_source <> 'split'
    GROUP BY 1, 2, 3
    UNION ALL
    SELECT t.user_id, t.site_id, c.source, SUM(c.amount)
    FROM site_engineer_transactions t
    CROSS JOIN LATERAL jsonb_to_recordset(t.payer_source_split)
      AS c(source text, name text, amount numeric)
    WHERE t.transaction_type = 'deposit' AND t.cancelled_at IS NULL
      AND t.payer_source = 'split' AND t.payer_source_split IS NOT NULL
    GROUP BY 1, 2, 3
  ),
  dep2 AS (
    SELECT user_id, site_id, source, SUM(deposited) AS deposited FROM dep GROUP BY 1, 2, 3
  ),
  alloc AS (
    SELECT s.user_id, s.site_id, a.payer_source AS source, SUM(a.amount) AS allocated
    FROM engineer_wallet_spend_allocations a
    JOIN site_engineer_transactions s ON s.id = a.spend_id
    WHERE a.kind = 'source' AND s.cancelled_at IS NULL
    GROUP BY 1, 2, 3
  )
  SELECT count(*) INTO v_bad
  FROM alloc al
  LEFT JOIN dep2 d
    ON d.user_id = al.user_id AND d.site_id = al.site_id AND d.source = al.source
  WHERE al.allocated > COALESCE(d.deposited, 0) + 0.01;

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Wallet re-derivation reconciliation FAILED: % source pool(s) over-allocated', v_bad;
  END IF;
END $$;

COMMENT ON VIEW v_engineer_wallet_pools IS
  'Per-source pool balances per (engineer, site). Drives the wallet breakdown card on /site/my-wallet. Unfunded portions now appear with kind=pending + payer_source=pending (formerly overdraft).';
