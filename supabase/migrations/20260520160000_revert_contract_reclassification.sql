-- Reverts migration 20260520140000_reclassify_misclassified_contract_settlements.
--
-- Why revert: the reclassification correctly routed the 7 settlements to the
-- Contract bucket via labor_payments(is_under_contract=true), but each of those
-- settlements also had market_laborer_attendance side-linked. The classification
-- rule is binary per settlement_group, so the market portion (₹15,300 across
-- the 7 dates) became invisible on /site/payments → Daily+Market.
--
-- User confirmed they prefer the pre-reclassify state where these dates remain
-- visible in Daily+Market, even though the row total understates true cash flow
-- (it shows only the contract portion; market is linked but not in the total).
--
-- The defensive trigger (20260520150000) STAYS in place — it only blocks new
-- INSERT/UPDATE of contract daily_attendance.settlement_group_id, not the
-- already-grandfathered rows on these 7 settlements. Future manual Studio
-- entries with this pattern will still fail.

DELETE FROM public.labor_payments
WHERE notes LIKE 'Backfilled by migration 20260520140000.%';

-- Sanity check: emit how many rows remain (expect 0).
DO $$
DECLARE
  v_remaining integer;
BEGIN
  SELECT COUNT(*) INTO v_remaining
  FROM public.labor_payments
  WHERE notes LIKE 'Backfilled by migration 20260520140000.%';
  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'Revert incomplete: % rows still match the backfill notes pattern', v_remaining;
  END IF;
  RAISE NOTICE 'Revert complete';
END $$;
