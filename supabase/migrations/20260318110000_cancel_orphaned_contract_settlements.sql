-- Cancel orphaned contract settlement_groups for Padmavati Apartments site.
--
-- Root cause: processWaterfallContractPayment created settlement_groups but
-- the subsequent labor_payments inserts silently failed. These 7 settlements
-- (all ₹1,500, dated March 13-14, 2026) have payment_type='salary' but
-- zero labor_payments, making them invisible in the history dialog and
-- not contributing to waterfall calculations.
--
-- The user will re-record these payments after the code fix is deployed.

UPDATE settlement_groups
SET
  is_cancelled = true,
  cancelled_at = NOW(),
  cancelled_by = 'system-migration',
  cancellation_reason = 'Auto-cancelled: orphaned settlement with no labor_payments (bug fix migration 20260318110000)'
WHERE id IN (
  '8f9eed87-a053-4e86-b24e-9afa715ff489',  -- SET-260314-002
  '58c7717e-4057-48e9-9b01-e1a70989fd50',  -- SET-260313-001
  '9789c513-78f7-45f5-b0bd-404b27b1d0f2',  -- SET-260313-002
  '40c40353-1477-415b-8aee-3777fc776408',  -- SET-260313-003
  '00ad73ee-2e32-47f8-9bbb-1013dfbca84b',  -- SET-260313-004
  '8a1037f9-ec47-4927-a35e-7f25ec6d17b4',  -- SET-260313-006
  'cbcc209b-e007-49c0-a20c-abd78e173a69'   -- SET-260313-007
)
AND is_cancelled = false;
