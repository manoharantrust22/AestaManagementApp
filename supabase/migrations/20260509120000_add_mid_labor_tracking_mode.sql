-- Mid (Laborer + Crew) tracking mode for trade contracts.
--
-- Use case: a mesthri brings a crew. You want to know which laborers worked
-- but you pay one daily total to the crew (not per laborer). Hybrid between
-- 'detailed' (per-laborer rates) and 'headcount' (anonymous role counts).
--
-- New mode: 'mid'
--   • One row per (contract, date) in subcontract_mid_entries
--   • laborer_ids[] is the presence roster — which laborers showed up
--   • day_total_amount is the crew's pay for the day (not split per laborer)
--   • work_done_units is the % / day-fraction of work completed (free numeric)

-- 1. Drop the existing CHECK on labor_tracking_mode
ALTER TABLE subcontracts
  DROP CONSTRAINT IF EXISTS subcontracts_labor_tracking_mode_check;

-- 2. Re-add with 'mid' included
ALTER TABLE subcontracts
  ADD CONSTRAINT subcontracts_labor_tracking_mode_check
  CHECK (labor_tracking_mode IN ('detailed', 'headcount', 'mesthri_only', 'mid'));

-- 3. Mid-mode entries table
CREATE TABLE IF NOT EXISTS subcontract_mid_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontract_id uuid NOT NULL REFERENCES subcontracts(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  laborer_ids uuid[] NOT NULL DEFAULT '{}',
  day_total_amount numeric NOT NULL DEFAULT 0,
  work_done_units numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (subcontract_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_subcontract_mid_entries_subcontract
  ON subcontract_mid_entries (subcontract_id, attendance_date DESC);

COMMENT ON TABLE subcontract_mid_entries IS
  'Daily entries for mid-mode trade contracts. One row per (subcontract, date) with the crew roster (laborer_ids) and the day total amount.';

-- 4. updated_at auto-bump trigger (mirrors other tables)
CREATE OR REPLACE FUNCTION trg_subcontract_mid_entries_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS subcontract_mid_entries_updated_at ON subcontract_mid_entries;
CREATE TRIGGER subcontract_mid_entries_updated_at
  BEFORE UPDATE ON subcontract_mid_entries
  FOR EACH ROW EXECUTE FUNCTION trg_subcontract_mid_entries_set_updated_at();

-- 5. RLS — same shape as subcontract_headcount_attendance: site-scoped via
--    parent subcontract → site. Authenticated users with access to the
--    parent site can read/write.
ALTER TABLE subcontract_mid_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subcontract_mid_entries_select" ON subcontract_mid_entries;
CREATE POLICY "subcontract_mid_entries_select"
  ON subcontract_mid_entries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM subcontracts s
      WHERE s.id = subcontract_mid_entries.subcontract_id
    )
  );

DROP POLICY IF EXISTS "subcontract_mid_entries_insert" ON subcontract_mid_entries;
CREATE POLICY "subcontract_mid_entries_insert"
  ON subcontract_mid_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM subcontracts s
      WHERE s.id = subcontract_mid_entries.subcontract_id
    )
  );

DROP POLICY IF EXISTS "subcontract_mid_entries_update" ON subcontract_mid_entries;
CREATE POLICY "subcontract_mid_entries_update"
  ON subcontract_mid_entries FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM subcontracts s
      WHERE s.id = subcontract_mid_entries.subcontract_id
    )
  );

DROP POLICY IF EXISTS "subcontract_mid_entries_delete" ON subcontract_mid_entries;
CREATE POLICY "subcontract_mid_entries_delete"
  ON subcontract_mid_entries FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM subcontracts s
      WHERE s.id = subcontract_mid_entries.subcontract_id
    )
  );
