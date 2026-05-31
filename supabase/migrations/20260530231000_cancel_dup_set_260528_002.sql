-- Data repair: reverse the duplicate salary settlement SET-260528-002 on Srinivasan House & Shop.
--
-- Root cause: on 2026-05-30 the 28 May market attendance was re-entered (AttendanceDrawer
-- hard-deletes + re-inserts attendance rows), which orphaned the original settlement
-- SET-260528-002 (created 2026-05-29) and its engineer-wallet debit WITHOUT reversing the
-- ₹2,450 spend. The date then re-surfaced as unsettled and was settled again as
-- SET-260528-003 (2026-05-30), producing a SECOND ₹2,450 wallet debit.
--
-- Net effect: one real ₹2,450 payment, two live uncancelled ₹2,450 debits. SET-260528-003
-- holds the live attendance rows and is kept; SET-260528-002 is the orphan and is reversed.
--
-- All statements are idempotent (guarded by is_cancelled=false / cancelled_at IS NULL) and
-- reversible (soft-cancel). Targeted by primary-key UUID only.

-- 1. Soft-cancel the phantom duplicate settlement_group.
UPDATE public.settlement_groups
SET is_cancelled         = true,
    cancelled_at         = now(),
    cancelled_by         = 'Hari Admin (duplicate cleanup 2026-05-30)',
    cancellation_reason  = 'Duplicate of SET-260528-003 — orphaned when 28 May attendance was re-entered 30 May; reversing double wallet debit'
WHERE id = '92015352-bc8e-44f7-819a-e8a20791d654'   -- SET-260528-002
  AND is_cancelled = false;

-- 2. Cancel the phantom ₹2,450 engineer-wallet debit. The balance/pools views filter
--    WHERE cancelled_at IS NULL, so this removes it from spend totals and pool allocations.
UPDATE public.site_engineer_transactions
SET cancelled_at        = now(),
    cancelled_by        = 'Hari Admin (duplicate cleanup 2026-05-30)',
    cancellation_reason = 'Reversing duplicate salary settlement SET-260528-002 (kept SET-260528-003)'
WHERE id = '5e771021-5974-4972-814e-d0d955588965'
  AND cancelled_at IS NULL;

-- 3. Remove the orphaned overdraft spend allocation for that debit (no deposit_id, so this
--    frees no real pool; kept clean to avoid a dangling allocation).
DELETE FROM public.engineer_wallet_spend_allocations
WHERE spend_id = '5e771021-5974-4972-814e-d0d955588965';
