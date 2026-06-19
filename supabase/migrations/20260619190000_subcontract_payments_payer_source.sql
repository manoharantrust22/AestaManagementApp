-- Phase 2 (contracts overhaul): bring /company/contracts Record Payment to parity
-- with Task Work / settlements — capture WHO paid (payer source) for direct payments
-- and allow the engineer-wallet channel.
--
-- subcontract_payments already has: receipt_url, payment_channel, site_engineer_transaction_id.
-- This migration is additive (nullable columns + a widened CHECK) — non-destructive.

ALTER TABLE public.subcontract_payments
  ADD COLUMN IF NOT EXISTS payer_source text,
  ADD COLUMN IF NOT EXISTS payer_name text,
  ADD COLUMN IF NOT EXISTS payer_source_split jsonb;

COMMENT ON COLUMN public.subcontract_payments.payer_source IS
  'Who funded a direct (non-wallet) payment: own_money | amma_money | client_money | trust_account | other_site_money | custom | split. NULL for engineer-wallet payments (sourced from wallet deposits).';
COMMENT ON COLUMN public.subcontract_payments.payer_name IS
  'Free-text payer name when payer_source requires it (other_site_money / custom).';
COMMENT ON COLUMN public.subcontract_payments.payer_source_split IS
  'When payer_source = split: array of { source, name?, amount } rows summing to amount.';

-- Widen the payment_channel CHECK to also allow the task-work-style channels
-- ('direct', 'engineer_wallet') while keeping any legacy values intact.
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT c.conname INTO v_conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'subcontract_payments'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%payment_channel%'
  LIMIT 1;

  IF v_conname IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.subcontract_payments DROP CONSTRAINT %I',
      v_conname
    );
  END IF;
END $$;

ALTER TABLE public.subcontract_payments
  ADD CONSTRAINT subcontract_payments_payment_channel_check
  CHECK (
    payment_channel IS NULL
    OR payment_channel IN (
      'via_site_engineer',
      'mesthri_at_office',
      'company_direct_online',
      'direct',
      'engineer_wallet'
    )
  );
