-- Migration: scope misc_expenses reference uniqueness to the site
-- Purpose: fix "duplicate key value violates unique constraint
--          misc_expenses_reference_number_key" when a second site adds a
--          miscellaneous expense on the same calendar day.
--
-- ROOT CAUSE: reference numbers are generated PER-SITE — generate_misc_expense_reference
-- computes MAX(seq)+1 with `WHERE site_id = p_site_id`, so MISC-YYMMDD-NNN restarts at
-- 001 for every site each day. But the constraint was GLOBAL (`UNIQUE (reference_number)`),
-- so the first site to add on a given day took MISC-<day>-001 and every other site's
-- insert that day collided. (The bulk-import RPC amplifies this by occupying low
-- sequence numbers under today's date code for one site.)
--
-- FIX: make the constraint match how references are generated — unique PER SITE.
-- Safe: no global duplicates exist today, so no (site_id, reference_number) duplicates
-- exist either; the ADD CONSTRAINT cannot fail on existing data.

ALTER TABLE public.misc_expenses
  DROP CONSTRAINT IF EXISTS misc_expenses_reference_number_key;

ALTER TABLE public.misc_expenses
  ADD CONSTRAINT misc_expenses_site_reference_key UNIQUE (site_id, reference_number);

-- The plain idx_misc_expenses_reference_number index is kept (harmless; supports
-- lookups by reference number). The new constraint adds its own composite index.
