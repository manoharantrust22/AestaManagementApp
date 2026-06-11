-- Re-add settlement_group_id to site_engineer_transactions.
--
-- wallet-v2 DROPPED this column from site_engineer_transactions (it moved to a
-- one-way link via settlement_groups.engineer_transaction_id). The initial_schema
-- snapshot still lists it, which is misleading — on the live DB it does NOT exist.
--
-- The duplicate-settlement fix re-introduces the REVERSE link so a wallet debit can
-- be deduped (the one-live-debit partial unique index uq_set_txn_live_settlement,
-- see 20260611120400) and traced back to its settlement (get_settlement_linkage).
-- This MUST run before 20260611120100 (which makes atomic_record_wallet_spend stamp
-- the column) and 20260611120400 (which backfills + indexes it).
--
-- Additive + nullable; no existing wallet-v2 logic reads it. ON DELETE SET NULL
-- mirrors the original (pre-drop) FK behaviour.
ALTER TABLE site_engineer_transactions
  ADD COLUMN IF NOT EXISTS settlement_group_id uuid
  REFERENCES settlement_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_set_transactions_settlement_group
  ON site_engineer_transactions (settlement_group_id);

COMMENT ON COLUMN site_engineer_transactions.settlement_group_id IS
  'The settlement this spend paid (re-added 2026-06-11 for dedup + linkage). NULL for deposits/returns/ad-hoc spends. Reverse link to settlement_groups.engineer_transaction_id.';
