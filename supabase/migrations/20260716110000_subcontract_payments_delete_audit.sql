-- Delete-audit columns for subcontract_payments.
--
-- WHY: `is_deleted` has existed since 20260103120000, but nothing records WHO
-- removed a payment, WHEN, or WHY. The workspace is gaining a "Remove" action
-- for wrongly-recorded section payments (money staff booked on a section whose
-- money actually lives in its fixed-price packages), so a soft-delete becomes a
-- routine money correction rather than a one-off cleanup. A rupee leaving the
-- ledger without a reason is exactly the kind of hole the settlement/misc cancel
-- paths already close with cancelled_at / cancelled_by_user_id /
-- cancellation_reason — this mirrors that trio.
--
-- Naming follows the misc_expenses cancel columns (noun-form reason), not the
-- adjective form: cancellation_reason -> deletion_reason.
--
-- Additive and nullable: every existing soft-deleted row keeps working, and the
-- legacy writers that only flip is_deleted (TradeSettlementView's headcount
-- delete, the 20260708134346 backfill) stay valid.

ALTER TABLE public.subcontract_payments
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS deletion_reason text;

COMMENT ON COLUMN public.subcontract_payments.deleted_at IS
  'When the payment was soft-deleted (is_deleted = true). NULL for live rows and for legacy rows deleted before this audit trail existed.';
COMMENT ON COLUMN public.subcontract_payments.deleted_by_user_id IS
  'public.users.id of whoever removed the payment. NOT auth.uid() — this FK targets the profile table.';
COMMENT ON COLUMN public.subcontract_payments.deletion_reason IS
  'Free-text reason captured when removing a wrongly-recorded payment.';
