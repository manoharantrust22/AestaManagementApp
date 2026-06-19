-- Task Work completion UX: capture WHY a package was completed (esp. with an
-- unsettled balance) and whether that balance is intentionally waived.
-- Additive + nullable/defaulted — no backfill, no view changes. The expense
-- in v_all_expenses stays paid-driven; these columns are display/audit only.
ALTER TABLE task_work_packages
  ADD COLUMN IF NOT EXISTS completion_reason text,
  ADD COLUMN IF NOT EXISTS balance_waived boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN task_work_packages.completion_reason IS
  'Free-text reason recorded when completing a package, especially when a balance is left unsettled.';
COMMENT ON COLUMN task_work_packages.balance_waived IS
  'TRUE when the remaining (unpaid) balance at completion is intentionally not owed (bargained down / scope reduced). Display only; reset to false on reopen.';
